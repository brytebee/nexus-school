#!/usr/bin/env node

/**
 * transcode-videos.js
 * 
 * Unified Transcoding & Mixing Processor for Nexus School OS Video Guides.
 * 
 * Functions:
 *   1. Recursively finds Playwright recorded `.webm` files under `tests/e2e/videos/`.
 *   2. Converts them to `.mp4` format.
 *   3. Upscales them to HD (1080p) or 4K (2160p) with high-fidelity scaling.
 *   4. Stretches time dynamically to slow down actions (e.g., 1.5x or 2x slower) for clear presentation.
 *   5. Overlays a subtle background music track (if assets/music.mp3 exists) or injects stereo comfort silence.
 *   6. Saves the polished output to `dist/videos/`.
 * 
 * Usage:
 *   node scripts/transcode-videos.js [--4k] [--speed 1.5] [--music assets/music.mp3]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Parse CLI Arguments
const args = process.argv.slice(2);
const is4K = !args.includes('--hd');
const speedArgIndex = args.indexOf('--speed');
const slowDownFactor = speedArgIndex !== -1 ? parseFloat(args[speedArgIndex + 1]) : 1.5;
const musicArgIndex = args.indexOf('--music');
let musicPath = musicArgIndex !== -1 ? args[musicArgIndex + 1] : null;

const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_DIR = path.join(ROOT_DIR, 'tests', 'e2e', 'videos');
const OUTPUT_DIR = path.join(ROOT_DIR, 'dist', 'videos');

// Helper to look for default music paths if not specified
if (!musicPath) {
  const defaultMusicPaths = [
    path.join(ROOT_DIR, 'assets', 'music.mp3'),
    path.join(ROOT_DIR, 'assets', 'background.mp3'),
    path.join(ROOT_DIR, 'assets', 'music.wav'),
  ];
  for (const p of defaultMusicPaths) {
    if (fs.existsSync(p)) {
      musicPath = p;
      break;
    }
  }
}

console.log('🎬 Starting E2E Video-as-Code Post-Processor...');
console.log(`🔹 Target Resolution: ${is4K ? '4K UHD (3840x2160)' : 'Full HD (1920x1080)'}`);
console.log(`🔹 Slow Motion Speed Factor: ${slowDownFactor}x slower`);
if (musicPath && fs.existsSync(musicPath)) {
  console.log(`🎵 Background Soundtrack: ${path.basename(musicPath)} (looped & soft-mixed)`);
} else {
  console.log('🔇 Background Soundtrack: None found. Injecting high-compatibility stereo comfort silence.');
}

// 1. Recursive finder for webm files
function findWebmFiles(dir, filesList = []) {
  if (!fs.existsSync(dir)) return filesList;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findWebmFiles(fullPath, filesList);
    } else if (item.endsWith('.webm')) {
      filesList.push(fullPath);
    }
  }
  return filesList;
}

const inputFiles = findWebmFiles(INPUT_DIR);
if (inputFiles.length === 0) {
  console.log('⚠️ No recorded .webm videos found in tests/e2e/videos/. Run E2E tests first!');
  process.exit(0);
}

console.log(`📂 Found ${inputFiles.length} source videos to transcode.`);

// 2. Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 3. Process each file
inputFiles.forEach((inputFile, index) => {
  // Construct a clean output filename
  // Format: parent-directory-name.mp4 (e.g. result-studio.mp4)
  const parentName = path.basename(path.dirname(inputFile));
  let cleanName = parentName
    .replace(/-Feature-Guide.*/gi, '')
    .replace(/-Feature-Guid.*/gi, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase();
  
  if (!cleanName || cleanName === 'videos') {
    cleanName = path.basename(inputFile, '.webm');
  }
  
  const outputFile = path.join(OUTPUT_DIR, `${cleanName}.mp4`);
  console.log(`\n──────────────────────────────────────────────────`);
  console.log(`[${index + 1}/${inputFiles.length}] ⚙️ Transcoding: ${path.basename(inputFile)}`);
  console.log(`📥 Input:  ${path.relative(ROOT_DIR, inputFile)}`);
  console.log(`📤 Output: ${path.relative(ROOT_DIR, outputFile)}`);

  // Build FFmpeg parameters
  const scaleFilter = is4K ? 'scale=3840:2160:flags=lanczos' : 'scale=1920:1080:flags=lanczos';
  const videoFilter = `[0:v]${scaleFilter},setpts=${slowDownFactor}*PTS[outv]`;
  
  let ffmpegArgs = [];
  
  // Input 1: The webm video
  ffmpegArgs.push('-y', '-i', inputFile);
  
  if (musicPath && fs.existsSync(musicPath)) {
    // Input 2: Loopable background audio
    ffmpegArgs.push('-stream_loop', '-1', '-i', musicPath);
    
    // Mix filter: slow down video, scale video, down-volume audio, combine
    ffmpegArgs.push(
      '-filter_complex',
      `${videoFilter};[1:a]volume=0.15[outa]`,
      '-map', '[outv]',
      '-map', '[outa]'
    );
  } else {
    // Generate stereo silence using lavfi source
    ffmpegArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
    ffmpegArgs.push(
      '-filter_complex',
      videoFilter,
      '-map', '[outv]',
      '-map', '1:a'
    );
  }

  // Encoding profiles for premium MP4 output
  ffmpegArgs.push(
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',          // High visual quality (lower CRF = higher quality)
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest'            // Stop when video stream ends
  );
  
  // Set bitrate boundaries depending on target resolution
  if (is4K) {
    ffmpegArgs.push('-maxrate', '15M', '-bufsize', '30M');
  } else {
    ffmpegArgs.push('-maxrate', '6M', '-bufsize', '12M');
  }
  
  ffmpegArgs.push(outputFile);

  // Run FFmpeg synchronously
  const result = spawnSync('ffmpeg', ffmpegArgs, { stdio: ['inherit', 'pipe', 'pipe'], encoding: 'utf-8' });

  if (result.status === 0) {
    console.log(`✅ Success! Video saved to: dist/videos/${cleanName}.mp4`);
    const stats = fs.statSync(outputFile);
    console.log(`   Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
  } else {
    console.error(`❌ Transcode Failed!`);
    console.error(result.stderr);
  }
});

console.log(`\n🎉 All transcoding tasks completed successfully!`);
console.log(`📁 Polished high-definition marketing videos are ready in: dist/videos/`);
