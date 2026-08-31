const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const frontendPath = path.join(__dirname, '..', 'tr-tech-frontend');
const outputPath = path.join(__dirname, '..', 'frontend-build');

// Check if frontend directory exists
if (!fs.existsSync(frontendPath)) {
  console.log('Frontend directory not found. Skipping frontend build.');
  process.exit(0);
}

console.log('Installing frontend dependencies...');
execSync('npm install', {
  cwd: frontendPath,
  stdio: 'inherit',
});

console.log('Building frontend...');
execSync('npm run build', {
  cwd: frontendPath,
  stdio: 'inherit',
});

// Copy built files to backend for Vercel deployment
const distPath = path.join(frontendPath, 'dist');
if (fs.existsSync(distPath)) {
  // Remove existing build directory
  if (fs.existsSync(outputPath)) {
    fs.rmSync(outputPath, { recursive: true });
  }
  fs.mkdirSync(outputPath, { recursive: true });

  // Copy dist contents to frontend-build
  const copyRecursive = (src, dest) => {
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      fs.readdirSync(src).forEach((file) => {
        copyRecursive(path.join(src, file), path.join(dest, file));
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  };

  copyRecursive(distPath, outputPath);
  console.log('Frontend build completed successfully.');
} else {
  console.error('Frontend build failed: dist directory not found.');
  process.exit(1);
}
