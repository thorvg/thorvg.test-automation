/*
 * Copyright (c) 2023 - 2026 ThorVG project. All rights reserved.

 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import resemble from 'resemblejs';

export const diffCanvas = async (canvas: any, targetCanvas: any): Promise<number> => {
  const thorvgURL = canvas.toDataURL("image/png");
  const lottieURL = targetCanvas.toDataURL("image/png");

  return new Promise((resolve, reject) => {
    resemble.compare(thorvgURL, lottieURL, { scaleToSameSize: true }, (err: any, data: any) => {
      console.log(err);
      const { misMatchPercentage, getImageDataUrl } = data;
      const diffImg = document.querySelector('#diff-img') as any;
      diffImg.src = getImageDataUrl();
      
      const result = parseFloat((100 - misMatchPercentage).toFixed(2));
      resolve(result);
    });
  });
}
