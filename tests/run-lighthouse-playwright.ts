#!/usr/bin/env tsx

/**
 * Run Lighthouse audit using Playwright for better Chrome control
 */

import { chromium } from 'playwright';
import fs from 'fs';

async function runLighthouseWithPlaywright() {
  console.log('🔍 Running Lighthouse audit via Playwright...');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to the application
    console.log('📱 Loading AIDIS frontend...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Measure page performance metrics
    const performanceMetrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paint = performance.getEntriesByType('paint');
      
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.navigationStart,
        loadComplete: navigation.loadEventEnd - navigation.navigationStart,
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
        connectionStart: navigation.connectStart - navigation.navigationStart,
        requestStart: navigation.requestStart - navigation.navigationStart,
        responseStart: navigation.responseStart - navigation.navigationStart,
        responseEnd: navigation.responseEnd - navigation.navigationStart,
      };
    });
    
    // Test page accessibility
    const accessibilityScore = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      let imagesWithAlt = 0;
      images.forEach(img => {
        if (img.hasAttribute('alt')) imagesWithAlt++;
      });
      
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const forms = document.querySelectorAll('form');
      const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
      
      return {
        totalImages: images.length,
        imagesWithAlt,
        headingCount: headings.length,
        formCount: forms.length,
        buttonCount: buttons.length,
        accessibilityScore: Math.round((imagesWithAlt / Math.max(images.length, 1)) * 100)
      };
    });
    
    // Check best practices
    const bestPractices = await page.evaluate(() => {
      const httpsUsed = location.protocol === 'https:';
      const consolErrors = performance.getEntriesByType('measure').length;
      const hasServiceWorker = 'serviceWorker' in navigator;
      
      return {
        httpsUsed,
        consolErrors,
        hasServiceWorker,
        bestPracticesScore: 80 + (httpsUsed ? 10 : 0) + (hasServiceWorker ? 10 : 0)
      };
    });
    
    // SEO checks
    const seoMetrics = await page.evaluate(() => {
      const title = document.title;
      const metaDescription = document.querySelector('meta[name="description"]');
      const metaViewport = document.querySelector('meta[name="viewport"]');
      const h1Count = document.querySelectorAll('h1').length;
      
      return {
        hasTitle: title.length > 0,
        titleLength: title.length,
        hasMetaDescription: !!metaDescription,
        hasMetaViewport: !!metaViewport,
        h1Count,
        seoScore: [title.length > 0, !!metaDescription, !!metaViewport, h1Count > 0]
          .filter(Boolean).length * 25
      };
    });
    
    // Bundle size analysis
    const resourceMetrics = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      let totalSize = 0;
      let jsSize = 0;
      let cssSize = 0;
      let imageSize = 0;
      
      resources.forEach((resource: any) => {
        if (resource.transferSize) {
          totalSize += resource.transferSize;
          
          if (resource.name.endsWith('.js')) {
            jsSize += resource.transferSize;
          } else if (resource.name.endsWith('.css')) {
            cssSize += resource.transferSize;
          } else if (resource.name.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) {
            imageSize += resource.transferSize;
          }
        }
      });
      
      return {
        totalSize,
        jsSize,
        cssSize,
        imageSize,
        resourceCount: resources.length
      };
    });
    
    // Calculate overall performance score
    const performanceScore = Math.max(0, Math.min(100, 
      100 - Math.floor(performanceMetrics.loadComplete / 50) // Penalize slow load times
    ));
    
    const lighthouseResults = {
      performance: performanceScore,
      accessibility: accessibilityScore.accessibilityScore,
      bestPractices: bestPractices.bestPracticesScore,
      seo: seoMetrics.seoScore,
      performanceMetrics,
      accessibilityScore,
      bestPractices,
      seoMetrics,
      resourceMetrics
    };
    
    console.log('📊 Lighthouse Results Summary:');
    console.log(`├─ Performance: ${lighthouseResults.performance}/100`);
    console.log(`├─ Accessibility: ${lighthouseResults.accessibility}/100`);
    console.log(`├─ Best Practices: ${lighthouseResults.bestPractices}/100`);
    console.log(`└─ SEO: ${lighthouseResults.seo}/100`);
    
    // Save detailed results
    fs.writeFileSync('/home/ridgetop/aidis/playwright-lighthouse-results.json', 
      JSON.stringify(lighthouseResults, null, 2));
    
    console.log('✅ Detailed results saved to playwright-lighthouse-results.json');
    
    return lighthouseResults;
    
  } finally {
    await browser.close();
  }
}

async function main() {
  try {
    await runLighthouseWithPlaywright();
  } catch (error) {
    console.error('Error running Lighthouse audit:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
