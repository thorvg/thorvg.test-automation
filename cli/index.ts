#! /usr/bin/env ts-node
'use strict';

import puppeteer from 'puppeteer';
import fs from "fs";
import path from "path";
import { exec } from 'child_process';
// @ts-ignore
import art from 'ascii-art';

(async () => {
  // CLI Options
  // * -D : debug
  // * -E : excute classify
  // * -V : verbose
  const isDebug = process.argv.includes('-D');
  const executionMode = process.argv.includes('-E');
  const verbose = process.argv.includes('-V');

  const browser = await puppeteer.launch({ 
    headless: isDebug ? false : 'new',
    protocolTimeout: 3000000,
  });
  const page = await browser.newPage();

  const textLogo = await art.font("ThorVG", 'doom').completed();
  console.log(textLogo);

  // Navigate the page to a URL
  await page.goto('https://thorvg-test-automation.vercel.app?debug=true');
  await page.setViewport({ width: 1080, height: 1024 });
  await page.waitForSelector('input');

  const targetDir = process.argv.pop() as string; // TODO: Should check filetype (single json/zip or directory)
  const fileList = fs.readdirSync(path.resolve(process.cwd(), targetDir)).filter(v => v.endsWith('.json')).map((file: string) => path.join(targetDir, file));
  
  const fileUploader = await page.$("input[type=file]");
  fileUploader?.uploadFile(...fileList);

  page.on('console', msg => {
    const log = msg.text();
    if (log.includes('Similarity')) {
      console.log('TEST LOG:', log);
    } else if (verbose) {
      console.log('VERBOSE LOG:', log);
    }
  });

  await page.waitForSelector('.debug-result-list', { timeout: 3000 * fileList.length });
  const json = await page.$eval('.debug-result-list', el => el.textContent) as string;
  const { passed, failed } = JSON.parse(json as string);

  if (executionMode) {
    let script = `mkdir -p ./passed ./failed;`;

    if (passed.length > 0) {
      script += ` mv ${passed.join(' ')} ./passed;`;
    }

    if (failed.length > 0) {
      script += ` mv ${failed.join(' ')} ./failed;`;
    }

    exec(`cd ${targetDir}; ${script}`);
  }

  if (failed.length > 0) {
    process.exit(1);
  }

  await page.waitForSelector('.debug-result-pdf');
  const pdfUriString = await page.$eval('.debug-result-pdf', el => el.textContent) as string;
  var buf = Buffer.from((pdfUriString as string).replace('data:application/pdf;filename=generated.pdf;base64,', ''), 'base64');
  fs.writeFileSync('result.pdf', buf);

  browser.close();
})();
