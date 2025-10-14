/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import type { Rect } from '../types';

export const imageToDataUrl=(image:HTMLImageElement)=>{
  return cropImage(image, {x:0,y:0,w:image.naturalWidth,h:image.naturalHeight }, image.naturalWidth, image.naturalHeight, false)
}

export const cropImage = (
  image: HTMLImageElement,
  cropRect: Rect,
  targetWidth: number,
  targetHeight: number,
  pixelated: boolean
): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return resolve('');
    }
    
    if (pixelated) {
      ctx.imageSmoothingEnabled = false;
    }

    ctx.drawImage(
      image,
      cropRect.x,
      cropRect.y,
      cropRect.w,
      cropRect.h,
      0,
      0,
      targetWidth,
      targetHeight
    );

    resolve(canvas.toDataURL('image/png'));
  });
};

export const rotateImage = (
  imageDataUrl: string,
  degrees: 90 | -90
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context'));
      }

      const { naturalWidth: w, naturalHeight: h } = image;
      
      // For 90-degree rotations, new dimensions are swapped
      canvas.width = h;
      canvas.height = w;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(degrees * Math.PI / 180);
      ctx.drawImage(image, -w / 2, -h / 2);

      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = (error) => reject(error);
    image.src = imageDataUrl;
  });
};

export const applyContrast = (
  imageDataUrl: string,
  contrast: number
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context'));
      }

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      ctx.filter = `contrast(${contrast})`;
      ctx.drawImage(image, 0, 0);

      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = (error) => reject(error);
    image.src = imageDataUrl;
  });
};

export const flipImageHorizontal = (
  imageDataUrl: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context'));
      }

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0);

      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = (error) => reject(error);
    image.src = imageDataUrl;
  });
};