import resemble from 'resemblejs';

export const diffWithResembleJS = async (canvas: any, targetCanvas: any): Promise<number> => {
  const thorvgURL = canvas.toDataURL("image/png");
  const lottieURL = targetCanvas.toDataURL("image/png");

  return new Promise((resolve, reject) => {
    resemble.compare(thorvgURL, lottieURL, { scaleToSameSize: true }, (err: any, data: any) => {
      console.log(err);
      const { misMatchPercentage, getImageDataUrl } = data;
      const diffImg = document.querySelector('#diff-img') as any;
      diffImg.src = getImageDataUrl();
      
      resolve(100 - misMatchPercentage);
    });
  });
}

export const diffWithOpenCV = async (cv: any, img1: typeof Image, img2: typeof Image) => {
  const mat = cv.imread(img1);
  const mat2 = cv.imread(img2);

  let srcVec = new cv.MatVector();
  srcVec.push_back(mat);
  let srcVec2 = new cv.MatVector();
  srcVec2.push_back(mat2);
  let accumulate = false;
  let channels = [0];
  let histSize = [256];
  let ranges = [0, 255];
  let hist = new cv.Mat();
  let hist2 = new cv.Mat();
  let mask = new cv.Mat();
  let color = new cv.Scalar(255, 255, 255);
  let scale = 2;
  // You can try more different parameters
  cv.calcHist(srcVec, channels, mask, hist, histSize, ranges, accumulate);
  let result = cv.minMaxLoc(hist, mask);
  let max = result.maxVal;

  const Mat = cv.Mat;

  // @ts-ignore
  let dst = new Mat.zeros(
    mat.rows, histSize[0] * scale,
    cv.CV_8UC3,
  );
  
  var hist1_values = '';
  // draw histogram
  for (let i = 0; i < histSize[0]; i++) {
      hist1_values += hist.data32F[i] + ',';
      let binVal = hist.data32F[i] * mat.rows / max;
      let point1 = new cv.Point(i * scale, mat.rows - 1);
      let point2 = new cv.Point((i + 1) * scale - 1, mat.rows - binVal);
      // cv.rectangle(dst, point1, point2, color, cv.FILLED);
  }
  console.log(hist1_values);
  
  // cv.imshow('thorvg-output-canvas', dst);

  cv.calcHist(srcVec2, channels, mask, hist2, histSize, ranges, accumulate);
  result = cv.minMaxLoc(hist, mask);
  max = result.maxVal;

  // @ts-ignore
  dst = new Mat.zeros(mat.rows, histSize[0] * scale,
                          cv.CV_8UC3);
  var hist2_values = '';
  // draw histogram
  for (let i = 0; i < histSize[0]; i++) {
      hist2_values += hist2.data32F[i] + ',';
      const binVal = hist2.data32F[i] * mat.rows / max;
      const point1 = new cv.Point(i * scale, mat.rows - 1);
      const point2 = new cv.Point((i + 1) * scale - 1, mat.rows - binVal);
      // cv.rectangle(dst, point1, point2, color, cv.FILLED);
  }

  console.log(hist2_values);
  // cv.imshow('lottie-output-canvas', dst);
  let compare_result = cv.compareHist(hist, hist2, 0);

  const compabilityOpenCV = compare_result * 100;
  return compabilityOpenCV;
}
