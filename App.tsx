/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useEffect, useRef, MouseEvent } from 'react';
import { DropZone } from './components/DropZone';
import { ImageDisplay } from './components/ImageDisplay';
import { PixelDissolve } from './components/PixelDissolve';
import { StatusBar } from './components/StatusBar';
import { SelectionAnimator } from './components/SelectionAnimator';
import type { Rect, HistoryStep, ImageDescription } from './types';
import { AppState } from './types';
import { cropImage, rotateImage, applyContrast, flipImageHorizontal } from './utils/imageUtils';
import { serviceEnhance } from './utils/serviceEnhance';
import { serviceDescribeImage } from './utils/serviceDescribeImage';
import { generateZoomGif } from './utils/gifGenerator';

interface EnhancementJob {
  originalRect: Rect;
  canvasWithSelectionDataUrl: string;
  pixelatedSrc: string;
  screenRect: Rect;
}

const App: React.FC = () => {
  // --- FEATURE FLAG ---
  // Set to true to use a fixed-size selection box (click to select).
  // Set to false to use a draggable selection box (click and drag to select).
  const useFixedSelectionBox = true;
  const fixedSelectionSizePercentage = 0.125; // e.g., 0.25 for 25% of image dimensions. Only used if useFixedSelectionBox is true.

  const LOCAL_STORAGE_KEY = 'enhancer-history';

  const [appState, setAppState] = useState<AppState>(AppState.LOADING);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [pixelatedImageSrc, setPixelatedImageSrc] = useState<string | null>(null);
  const [enhancedImageSrc, setEnhancedImageSrc] = useState<string | null>(null);
  const [finalImageSrc, setFinalImageSrc] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryStep[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [newHistoryEntryData, setNewHistoryEntryData] = useState<{description: ImageDescription, originalRect: Rect} | null>(null);

  const [enhancementJob, setEnhancementJob] = useState<EnhancementJob | null>(null);
  const [finalEnhancementRect, setFinalEnhancementRect] = useState<Rect | null>(null);
  const [displaySelection, setDisplaySelection] = useState<Rect | null>(null);
  const [isGeneratingGif, setIsGeneratingGif] = useState<boolean>(false);
  const [showBananaBanner, setShowBananaBanner] = useState<boolean>(false);
  const [hasFoundBanana, setHasFoundBanana] = useState<boolean>(false);
  const [contrast, setContrast] = useState<number>(1);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageObjectURLRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isBusy = [AppState.ENHANCING, AppState.ENHANCED, AppState.ROTATING, AppState.LOADING, AppState.PROCESSING].includes(appState) || isGeneratingGif;

  const loadInitialImage = useCallback(async () => {
    if (imageObjectURLRef.current) {
      URL.revokeObjectURL(imageObjectURLRef.current);
      imageObjectURLRef.current = null;
    }

    setAppState(AppState.LOADING);
    try {
      const response = await fetch('https://www.gstatic.com/aistudio/starter-apps/enhance/living_room.png');
      if (!response.ok) {
        throw new Error(`Failed to fetch initial image: ${response.statusText}`);
      }
      const blob = await response.blob();
      const objectURL = URL.createObjectURL(blob);
      imageObjectURLRef.current = objectURL;

      const img = new Image();
      img.onload = () => {
        const newStep: HistoryStep = { imageSrc: objectURL, description: null, originalRect: null };
        setHistory([newStep]);
        setHistoryIndex(0);
        setImage(img);
        setFinalImageSrc(objectURL);
        setDisplaySelection(null);
        setContrast(1);
        setAppState(AppState.LOADED);
      };
      img.onerror = () => {
        console.error("Image failed to load from object URL.");
        setAppState(AppState.IDLE);
        if (imageObjectURLRef.current) {
          URL.revokeObjectURL(imageObjectURLRef.current);
          imageObjectURLRef.current = null;
        }
      };
      img.src = objectURL;
    } catch (error) {
      console.error("Failed to load initial image:", error);
      setAppState(AppState.IDLE);
    }
  }, []);
  
  const resetState = useCallback(() => {
    setEnhancementJob(null);
    setFinalEnhancementRect(null);
    setHistory([]);
    setHistoryIndex(-1);
    setNewHistoryEntryData(null);
    setDisplaySelection(null);
    setShowBananaBanner(false);
    setContrast(1);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    loadInitialImage();
  }, [loadInitialImage]);

  useEffect(() => {
    // Try to load from local storage first
    const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedData) {
      try {
        const { history: savedHistory, historyIndex: savedHistoryIndex } = JSON.parse(savedData);
        
        if (Array.isArray(savedHistory) && savedHistory.length > 0 && typeof savedHistoryIndex === 'number') {
          setHistory(savedHistory);
          setHistoryIndex(savedHistoryIndex);

          const currentImageSrc = savedHistory[savedHistoryIndex].imageSrc;
          const img = new Image();
          img.onload = () => {
            setImage(img);
            setFinalImageSrc(currentImageSrc);
            setContrast(1);
            setAppState(AppState.LOADED);
          };
          img.onerror = () => {
            console.error("Failed to load saved image from history. Loading default.");
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            loadInitialImage();
          };
          img.src = currentImageSrc;
          return; // Exit effect if loaded successfully
        }
      } catch (error) {
        console.error("Failed to parse saved history, loading default image.", error);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
    
    // If no saved data or loading failed, load the initial image
    loadInitialImage();
    
    return () => {
      if (imageObjectURLRef.current) {
        URL.revokeObjectURL(imageObjectURLRef.current);
      }
    };
  }, [loadInitialImage]);

  // Save history to local storage whenever it changes
  useEffect(() => {
    if (history.length > 0) {
      const dataToSave = JSON.stringify({ history, historyIndex });
      localStorage.setItem(LOCAL_STORAGE_KEY, dataToSave);
    }
  }, [history, historyIndex]);


  const handleFileDrop = useCallback((file: File) => {
    if (imageObjectURLRef.current) {
      URL.revokeObjectURL(imageObjectURLRef.current);
      imageObjectURLRef.current = null;
    }
    
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const newImageSrc = e.target?.result as string;
          const newStep: HistoryStep = { imageSrc: newImageSrc, description: null, originalRect: null };
          setHistory([newStep]);
          setHistoryIndex(0);
          setImage(img);
          setFinalImageSrc(newImageSrc);
          setEnhancementJob(null);
          setFinalEnhancementRect(null);
          setDisplaySelection(null);
          setShowBananaBanner(false);
          setContrast(1);
          setAppState(AppState.LOADED);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileDrop(e.target.files[0]);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleSelection = useCallback(async (originalRect: Rect, screenRect: Rect, canvasWithSelectionDataUrl: string) => {
    if (!image || isBusy) return;

    // If we are not at the head of history, a new selection creates a new branch.
    // We truncate the "redo" history here to ensure the new step is added correctly
    // and that runEnhancementJob gets the correct history.
    if (historyIndex < history.length - 1) {
      const newHistory = history.slice(0, historyIndex + 1);
      setHistory(newHistory);
    }

    setAppState(AppState.ENHANCING);
    
    const aspectRatio = originalRect.w / originalRect.h;
    const padding = 0.05;
    const maxWidth = window.innerWidth * (1 - padding);
    const maxHeight = window.innerHeight * (1 - padding);

    let targetWidth = maxWidth;
    let targetHeight = targetWidth / aspectRatio;

    if (targetHeight > maxHeight) {
        targetHeight = maxHeight;
        targetWidth = targetHeight * aspectRatio;
    }
    
    setFinalEnhancementRect({
        w: targetWidth,
        h: targetHeight,
        x: (window.innerWidth - targetWidth) / 2,
        y: (window.innerHeight - targetHeight) / 2,
    });

    const pixelatedSrc = await cropImage(image, originalRect, originalRect.w, originalRect.h, true);
    
    setEnhancementJob({
      originalRect,
      canvasWithSelectionDataUrl,
      pixelatedSrc,
      screenRect,
    });

  }, [image, history, historyIndex, isBusy]);

  const runEnhancementJob = useCallback(async () => {
    if (!enhancementJob || !image) return;
    
    const { originalRect, canvasWithSelectionDataUrl, pixelatedSrc } = enhancementJob;

    try {
        const descriptionHistory = history.slice(0, historyIndex + 1).map(h => h.description).filter((d): d is ImageDescription => d !== null);
        const croppedSelectionDataUrl = await cropImage(image, originalRect, originalRect.w, originalRect.h, false);
        const description = await serviceDescribeImage(canvasWithSelectionDataUrl, descriptionHistory, croppedSelectionDataUrl);
        
        setNewHistoryEntryData({ description, originalRect });

        // Calculate padded rect for enhancement context
        const sourceImageWidth = image.naturalWidth;
        const sourceImageHeight = image.naturalHeight;
        const padding = 0.25; // 25% padding

        const paddedX = originalRect.x - originalRect.w * padding;
        const paddedY = originalRect.y - originalRect.h * padding;
        const paddedW = originalRect.w * (1 + 2 * padding);
        const paddedH = originalRect.h * (1 + 2 * padding);

        const finalPaddedX = Math.max(0, paddedX);
        const finalPaddedY = Math.max(0, paddedY);
        const finalPaddedX2 = Math.min(sourceImageWidth, paddedX + paddedW);
        const finalPaddedY2 = Math.min(sourceImageHeight, paddedY + paddedH);

        const paddedRect = {
            x: finalPaddedX,
            y: finalPaddedY,
            w: finalPaddedX2 - finalPaddedX,
            h: finalPaddedY2 - finalPaddedY,
        };
        
        // Crop with padding for enhancement
        const aspect = paddedRect.h / paddedRect.w;
        const targetWidth = 512 * (1.+padding);
        const targetHeight = Math.round(targetWidth * aspect);
        const croppedForEnhancement = await cropImage(image, paddedRect, targetWidth, targetHeight, false);

        const { imageSrc: enhancedPaddedSrc, foundTheBanana } = await serviceEnhance(croppedForEnhancement, [...descriptionHistory.map(d=>d.prompt), description.prompt], hasFoundBanana);
        
        if (foundTheBanana) {
            setShowBananaBanner(true);
            setHasFoundBanana(true);
        }

        // Load the enhanced padded image to perform the final crop
        const enhancedPaddedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = enhancedPaddedSrc;
        });

        // Calculate the crop area within the enhanced padded image that corresponds to the original selection
        const finalCropRect = {
            x: enhancedPaddedImage.naturalWidth * ((originalRect.x - paddedRect.x) / paddedRect.w),
            y: enhancedPaddedImage.naturalHeight * ((originalRect.y - paddedRect.y) / paddedRect.h),
            w: enhancedPaddedImage.naturalWidth * (originalRect.w / paddedRect.w),
            h: enhancedPaddedImage.naturalHeight * (originalRect.h / paddedRect.h),
        };

        // Perform the final crop to the original selection aspect ratio at a higher resolution
        const finalImageWidth = 1024;
        const finalImageHeight = Math.round(finalImageWidth * (originalRect.h / originalRect.w));
        
        const enhancedSrc = await cropImage(enhancedPaddedImage, finalCropRect, finalImageWidth, finalImageHeight, false);

        setPixelatedImageSrc(pixelatedSrc);
        setEnhancedImageSrc(enhancedSrc);
        setAppState(AppState.ENHANCED);

    } catch (error) {
        console.error("Enhancement process failed:", error);
        const fallbackSrc = await cropImage(image, originalRect, originalRect.w * 2, originalRect.h * 2, false);
        setPixelatedImageSrc(pixelatedSrc);
        setEnhancedImageSrc(fallbackSrc);
        setAppState(AppState.ENHANCED);
    } finally {
        setEnhancementJob(null);
    }
  }, [enhancementJob, image, history, historyIndex, hasFoundBanana]);
  
  const handleEnhancementComplete = useCallback(() => {
    if (enhancedImageSrc && newHistoryEntryData) {
        const newStep: HistoryStep = {
            imageSrc: enhancedImageSrc,
            description: newHistoryEntryData.description,
            originalRect: newHistoryEntryData.originalRect,
        };

        const newHistory = history.slice(0, historyIndex + 1);
        setHistory([...newHistory, newStep]);
        setHistoryIndex(newHistory.length);

        const newImage = new Image();
        newImage.onload = () => {
            setImage(newImage);
            setFinalImageSrc(enhancedImageSrc);
            //setPixelatedImageSrc(null);
            setEnhancedImageSrc(null);
            setFinalEnhancementRect(null);
            setNewHistoryEntryData(null);
            setDisplaySelection(null);
            setContrast(1);
            setAppState(AppState.LOADED);
        }
        newImage.src = enhancedImageSrc;
    }
  }, [enhancedImageSrc, newHistoryEntryData, history, historyIndex]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileDrop(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0 || isBusy) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    
    const nextStep = history[newIndex + 1];
    setDisplaySelection(nextStep?.originalRect || null);
    setContrast(1);

    const newImageSrc = history[newIndex].imageSrc;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setFinalImageSrc(newImageSrc);
    };
    img.src = newImageSrc;
  }, [history, historyIndex, isBusy]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1 || isBusy) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);

    const nextStep = history[newIndex + 1];
    setDisplaySelection(nextStep?.originalRect || null);
    setContrast(1);

    const newImageSrc = history[newIndex].imageSrc;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setFinalImageSrc(newImageSrc);
    };
    img.src = newImageSrc;
  }, [history, historyIndex, isBusy]);

  const handleRegenerate = useCallback(async () => {
    if (historyIndex <= 0 || isBusy) return;

    setAppState(AppState.ENHANCING);
    
    const previousStep = history[historyIndex - 1];
    const currentStep = history[historyIndex];
    const originalRect = currentStep.originalRect;

    if (!originalRect) {
        setAppState(AppState.LOADED);
        return;
    }

    const sourceImage = new Image();
    sourceImage.crossOrigin = "anonymous";
    sourceImage.onload = async () => {
      try {
        const descriptionHistory = history.slice(0, historyIndex).map(h => h.description).filter((d): d is ImageDescription => d !== null);
        
        const croppedForDescription = await cropImage(sourceImage, originalRect, originalRect.w, originalRect.h, false);
        const description = await serviceDescribeImage(croppedForDescription, descriptionHistory, croppedForDescription);
        
        const sourceImageWidth = sourceImage.naturalWidth;
        const sourceImageHeight = sourceImage.naturalHeight;
        const padding = 0.5;

        const paddedX = originalRect.x - originalRect.w * padding;
        const paddedY = originalRect.y - originalRect.h * padding;
        const paddedW = originalRect.w * (1 + 2 * padding);
        const paddedH = originalRect.h * (1 + 2 * padding);

        const finalPaddedX = Math.max(0, paddedX);
        const finalPaddedY = Math.max(0, paddedY);
        const finalPaddedX2 = Math.min(sourceImageWidth, paddedX + paddedW);
        const finalPaddedY2 = Math.min(sourceImageHeight, paddedY + paddedH);

        const paddedRect = {
            x: finalPaddedX,
            y: finalPaddedY,
            w: finalPaddedX2 - finalPaddedX,
            h: finalPaddedY2 - finalPaddedY,
        };

        const aspect = paddedRect.h / paddedRect.w;
        const targetWidth = 512;
        const targetHeight = Math.round(targetWidth * aspect);
        const croppedForEnhancement = await cropImage(sourceImage, paddedRect, targetWidth, targetHeight, false);
        
        const { imageSrc: enhancedPaddedSrc, foundTheBanana } = await serviceEnhance(croppedForEnhancement, [...descriptionHistory.map(d=>d.prompt), description.prompt], hasFoundBanana);

        if (foundTheBanana) {
            setShowBananaBanner(true);
            setHasFoundBanana(true);
        }

        const enhancedPaddedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = enhancedPaddedSrc;
        });

        const finalCropRect = {
            x: enhancedPaddedImage.naturalWidth * ((originalRect.x - paddedRect.x) / paddedRect.w),
            y: enhancedPaddedImage.naturalHeight * ((originalRect.y - paddedRect.y) / paddedRect.h),
            w: enhancedPaddedImage.naturalWidth * (originalRect.w / paddedRect.w),
            h: enhancedPaddedImage.naturalHeight * (originalRect.h / paddedRect.h),
        };

        const finalImageWidth = 1024;
        const finalImageHeight = Math.round(finalImageWidth * (originalRect.h / originalRect.w));
        
        const enhancedSrc = await cropImage(enhancedPaddedImage, finalCropRect, finalImageWidth, finalImageHeight, false);

        const newStep: HistoryStep = {
            imageSrc: enhancedSrc,
            description,
            originalRect,
        };

        const newHistory = [...history.slice(0, historyIndex), newStep];
        setHistory(newHistory);
        setDisplaySelection(null);
        setContrast(1);

        const newImage = new Image();
        newImage.onload = () => {
            setImage(newImage);
            setFinalImageSrc(enhancedSrc);
            setAppState(AppState.LOADED);
        };
        newImage.src = enhancedSrc;

      } catch (error) {
        console.error("Regeneration failed:", error);
        setAppState(AppState.LOADED);
      }
    };
    sourceImage.src = previousStep.imageSrc;
  }, [history, historyIndex, isBusy, hasFoundBanana]);

  const handleExportGif = useCallback(async () => {
    if (historyIndex < 1) return;
    setIsGeneratingGif(true);
    try {
      const blob = await generateZoomGif(history.slice(0, historyIndex + 1));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'enhancement-zoom.gif';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to generate GIF:", error);
    } finally {
      setIsGeneratingGif(false);
    }
  }, [history, historyIndex]);

  const handleRotate = useCallback(async (direction: 'left' | 'right') => {
    if (!finalImageSrc || isBusy) {
      return;
    }

    setAppState(AppState.ROTATING);
    try {
      const degrees = direction === 'left' ? -90 : 90;
      const rotatedImageSrc = await rotateImage(finalImageSrc, degrees);

      // Truncate history if we're not at the latest step
      const newHistory = history.slice(0, historyIndex + 1);
      
      const newStep: HistoryStep = { 
        imageSrc: rotatedImageSrc, 
        description: { selectionDescription: `Rotated image ${direction}`}, 
        originalRect: null 
      };

      setHistory([...newHistory, newStep]);
      setHistoryIndex(newHistory.length);

      const newImage = new Image();
      newImage.onload = () => {
        setImage(newImage);
        setFinalImageSrc(rotatedImageSrc);
        setDisplaySelection(null);
        setContrast(1);
        setAppState(AppState.LOADED);
      };
      newImage.src = rotatedImageSrc;
    } catch (error) {
      console.error("Failed to rotate image:", error);
      setAppState(AppState.LOADED); // Revert state on error
    }
  }, [finalImageSrc, isBusy, history, historyIndex]);

  const handleFlipHorizontal = useCallback(async () => {
    if (!finalImageSrc || isBusy) {
      return;
    }

    setAppState(AppState.PROCESSING);
    try {
      const flippedImageSrc = await flipImageHorizontal(finalImageSrc);

      // Truncate history if we're not at the latest step
      const newHistory = history.slice(0, historyIndex + 1);
      
      const newStep: HistoryStep = { 
        imageSrc: flippedImageSrc, 
        description: { selectionDescription: `Flipped image horizontally` },
        originalRect: null 
      };

      setHistory([...newHistory, newStep]);
      setHistoryIndex(newHistory.length);

      const newImage = new Image();
      newImage.onload = () => {
        setImage(newImage);
        setFinalImageSrc(flippedImageSrc);
        setDisplaySelection(null);
        setContrast(1); // Reset slider for the new base image
        setAppState(AppState.LOADED);
      };
      newImage.src = flippedImageSrc;
    } catch (error) {
      console.error("Failed to flip image:", error);
      setAppState(AppState.LOADED); // Revert state on error
    }
  }, [finalImageSrc, isBusy, history, historyIndex]);

  const handleApplyContrast = useCallback(async () => {
    if (!finalImageSrc || isBusy || contrast === 1) {
      return;
    }

    setAppState(AppState.PROCESSING);
    try {
      const contrastAppliedImageSrc = await applyContrast(finalImageSrc, contrast);

      // Truncate history if we're not at the latest step
      const newHistory = history.slice(0, historyIndex + 1);
      
      const newStep: HistoryStep = { 
        imageSrc: contrastAppliedImageSrc, 
        description: { selectionDescription: `Adjusted contrast to ${Math.round(contrast * 100)}%` },
        originalRect: null 
      };

      setHistory([...newHistory, newStep]);
      setHistoryIndex(newHistory.length);

      const newImage = new Image();
      newImage.onload = () => {
        setImage(newImage);
        setFinalImageSrc(contrastAppliedImageSrc);
        setDisplaySelection(null);
        setContrast(1); // Reset slider for the new base image
        setAppState(AppState.LOADED);
      };
      newImage.src = contrastAppliedImageSrc;
    } catch (error) {
      console.error("Failed to apply contrast:", error);
      setAppState(AppState.LOADED); // Revert state on error
    }
  }, [finalImageSrc, isBusy, history, historyIndex, contrast]);


  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with text inputs if any were added
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || isBusy) {
        return;
      }
      
      if (e.key === '[') {
        e.preventDefault();
        handleRotate('left');
      } else if (e.key === ']') {
        e.preventDefault();
        handleRotate('right');
      } else if (e.key === 'h') {
        e.preventDefault();
        handleFlipHorizontal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isBusy, handleRotate, handleFlipHorizontal]);


  const stopPropagation = (ev:MouseEvent<HTMLElement>)=>{
    ev.stopPropagation();
  }

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 bg-black flex flex-col items-center justify-center p-4"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {showBananaBanner && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-400 text-black text-center p-2 z-20 font-bold text-lg animate-pulse flex items-center justify-center">
          <span>🍌 YOU FOUND THE NANO BANANA! 🍌</span>
          <button 
            onClick={() => setShowBananaBanner(false)} 
            className="absolute right-4 text-black hover:text-gray-700 text-2xl font-bold leading-none"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}
      {appState === AppState.IDLE && <DropZone />}
      
      <div className="w-full h-full flex items-center justify-center relative">
        {finalImageSrc && ![AppState.ENHANCED, AppState.ENHANCING].includes(appState) && (
          <ImageDisplay
            imageSrc={finalImageSrc}
            onSelect={handleSelection}
            isEnhancing={isBusy}
            historicalSelection={displaySelection}
            useFixedSelectionBox={useFixedSelectionBox}
            fixedSelectionSizePercentage={fixedSelectionSizePercentage}
            contrast={contrast}
          />
        )}
      </div>

      {enhancementJob && appState === AppState.ENHANCING && finalEnhancementRect && (
          <SelectionAnimator
              rect={enhancementJob.screenRect}
              finalRect={finalEnhancementRect}
              src={enhancementJob.pixelatedSrc}
              onComplete={runEnhancementJob}
          />
      )}

      {appState === AppState.ENHANCED && pixelatedImageSrc && enhancedImageSrc && finalEnhancementRect && (
        <div 
          className="absolute"
          style={{
            top: `${finalEnhancementRect.y}px`,
            left: `${finalEnhancementRect.x}px`,
            width: `${finalEnhancementRect.w}px`,
            height: `${finalEnhancementRect.h}px`,
          }}
        >
          <PixelDissolve
            lowResSrc={pixelatedImageSrc}
            highResSrc={enhancedImageSrc}
            onComplete={handleEnhancementComplete}
          />
        </div>
      )}

      {appState === AppState.LOADED && history.length >= 1 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/50 p-2 rounded-md border border-green-500/60 flex-wrap justify-center">
          <button 
            onClick={handleUndo}
            onMouseDownCapture={stopPropagation}
            disabled={historyIndex <= 0 || isBusy} 
            className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors" aria-label="Undo"
          >
            &lt;
          </button>
          <span className="text-xs w-24 text-center">Step: {historyIndex + 1} / {history.length}</span>
          <button 
            onClick={handleRedo} 
            onMouseDownCapture={stopPropagation}
            disabled={historyIndex >= history.length - 1 || isBusy} 
            className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors" aria-label="Redo"
          >
            &gt;
          </button>
          <button 
            onClick={handleRegenerate} 
            onMouseDownCapture={stopPropagation}
            disabled={historyIndex <= 0 || isBusy} 
            className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors"
          >
            Re-gen
          </button>
          <button 
            onClick={handleExportGif} 
            onMouseDownCapture={stopPropagation}
            disabled={historyIndex < 1 || isBusy} 
            className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors"
          >
            {isGeneratingGif ? 'Generating...' : 'Export GIF'}
          </button>
          <button
              onClick={() => handleRotate('left')}
              onMouseDownCapture={stopPropagation}
              disabled={isBusy || !finalImageSrc}
              className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors text-xl"
              aria-label="Rotate counter-clockwise"
              title="Rotate Left ([)"
          >
            ↶
          </button>
          <button
              onClick={() => handleRotate('right')}
              onMouseDownCapture={stopPropagation}
              disabled={isBusy || !finalImageSrc}
              className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors text-xl"
              aria-label="Rotate clockwise"
              title="Rotate Right (])"
          >
            ↷
          </button>
          <button
              onClick={handleFlipHorizontal}
              onMouseDownCapture={stopPropagation}
              disabled={isBusy || !finalImageSrc}
              className="px-3 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors text-xl"
              aria-label="Flip horizontally"
              title="Flip Horizontal (h)"
          >
            ↔
          </button>

          <div className="flex items-center gap-1 border-l border-green-500/60 pl-2 ml-2">
            <label htmlFor="contrast-slider" className="text-xs text-green-400" title="Adjust Contrast">Contrast</label>
            <input
                id="contrast-slider"
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={contrast}
                onChange={(e) => setContrast(parseFloat(e.target.value))}
                onMouseDownCapture={stopPropagation}
                disabled={isBusy || !finalImageSrc}
                className="w-24"
                aria-label="Contrast slider"
                title={`Contrast: ${Math.round(contrast * 100)}%`}
            />
            <button
                onClick={handleApplyContrast}
                onMouseDownCapture={stopPropagation}
                disabled={contrast === 1 || isBusy || !finalImageSrc}
                className="px-2 py-1 text-green-400 disabled:text-gray-300 disabled:cursor-not-allowed hover:enabled:bg-green-500/20 rounded transition-colors text-sm"
            >
                Apply
            </button>
          </div>

          <button 
            onClick={resetState}
            onMouseDownCapture={stopPropagation}
            disabled={isBusy}
            className="px-3 py-1 text-green-400 hover:enabled:bg-green-500/20 rounded transition-colors disabled:text-gray-300 disabled:cursor-not-allowed border-l border-green-500/60 ml-2 pl-2"
          >
            Reset
          </button>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        accept="image/*"
      />
      <StatusBar 
        state={appState} 
        useFixedSelectionBox={useFixedSelectionBox}
        isInitialState={history.length <= 1 && historyIndex === 0 && !history[0]?.description}
        onUploadClick={handleUploadClick}
      />
    </div>
  );
};

export default App;