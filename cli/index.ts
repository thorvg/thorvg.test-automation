#! /usr/bin/env ts-node
'use strict';

import puppeteer from 'puppeteer';
import fs from "fs";
import path from "path";
import { exec } from 'child_process';

(async () => {
  // CLI Options
  // * -D : debug
  // * -E : excute classify
  const isDebug = process.argv.includes('-D');
  const executionMode = process.argv.includes('-E');

  const browser = await puppeteer.launch({ 
    headless: !isDebug,
    protocolTimeout: 3000000,
  });
  const page = await browser.newPage();

  // Navigate the page to a URL
  await page.goto('https://thorvg-tester.vercel.app?debug=true');
  await page.setViewport({ width: 1080, height: 1024 });
  await page.waitForSelector('input');

  const targetDir = process.argv.pop() as string; // TODO: Should check filetype (single json/zip or directory)
  const fileList = fs.readdirSync(path.resolve(process.cwd(), targetDir)).filter(v => v.endsWith('.json')).map((file: string) => path.join(targetDir, file));
  
  const fileUploader = await page.$("input[type=file]");
  fileUploader?.uploadFile(...fileList);

  await page.waitForSelector('.debug-result-script', { timeout: 3000 * fileList.length });
  const script = await page.$eval('.debug-result-script', el => el.textContent);

  if (executionMode) {
    exec(`cd ${targetDir}; ${script}`);
  }

  await page.waitForSelector('.debug-result-pdf');
  const pdfUriString = await page.$eval('.debug-result-pdf', el => el.textContent) as string;
  var buf = Buffer.from((pdfUriString as string).replace('data:application/pdf;filename=generated.pdf;base64,', ''), 'base64');
  fs.writeFileSync('result.pdf', buf);

  // TODO: log progress, case by case, total progress

  browser.close();
})();
