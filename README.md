// name=video-worker-example.js
// Note: requires ffmpeg installed on worker machine and Node.js
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function makeCinematicReel(images, musicPath, outPath) {
  // images: array of local file paths, assume same size or will be scaled
  // musicPath: optional background music path
  // outPath: final mp4 path

  // Parameters:
  const width = 1080;
  const height = 1920;
  const displaySeconds = 3.5; // seconds per image
  const transitionSeconds = 0.8; // crossfade duration
  const fps = 30;

  // Step 1: For each image create a short video segment with slow zoom
  // We'll create tmp files seg0.mp4, seg1.mp4, ...
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'reel-'));
  const segFiles = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const seg = path.join(tmpDir, `seg${i}.mp4`);
    // Create a short video from image with zoom using zoompan filter.
    // We set -t to displaySeconds + small extra so transitions don't cut.
    // This command uses -loop 1 to hold the image and zoompan to create motion.
    const zoomFrames = Math.round(displaySeconds * fps);
    // zoompan uses output frames count as d=, so compute d = zoomFrames
    const zoomCommand = [
      '-y',
      '-loop 1',
      `-i "${img}"`,
      '-vf',
      `"scale=${width}:${height},zoompan=z='if(lte(on,1),1.0,zoom+0.0008)':d=${zoomFrames}:s=${width}x${height}"`,
      '-c:v libx264 -t ' + displaySeconds,
      '-pix_fmt yuv420p',
      `"${seg}"`
    ].join(' ');

    execSync(`ffmpeg ${zoomCommand}`, { stdio: 'inherit', shell: true });
    segFiles.push(seg);
  }

  // Step 2: Chain segments with xfade transitions.
  // Build filter_complex for N segments. This sample builds pairwise xfade for sequential segments.
  // For simplicity for 3 segments:
  // [0:v][1:v]xfade=transition=fade:duration=0.8:offset=3.5[v01];
  // [v01][2:v]xfade=transition=fade:duration=0.8:offset=7.0[vout]
  // Offset for next xfade equals previous offset + displaySeconds - transitionSeconds
  let filter = '';
  let inputs = segFiles.map((s, idx) => `-i "${s}"`).join(' ');
  let mapVideoLabel = '';
  if (segFiles.length === 1) {
    // No transitions needed
    execSync(`ffmpeg -y -i "${segFiles[0]}" ${musicPath ? `-i "${musicPath}"` : ''} -c:v copy ${musicPath ? '-c:a aac -shortest' : ''} "${outPath}"`, { stdio: 'inherit', shell: true });
  } else {
    // Build filter chain dynamically
    let offset = displaySeconds; // first xfade offset relative to start
    const parts = [];
    for (let i = 0; i < segFiles.length; i++) {
      parts.push(`[${i}:v]format=yuv420p,setsar=1[v${i}]`);
    }
    filter += parts.join(';') + ';';
    // Now create progressive xfade chain
    let lastLabel = null;
    for (let i = 0; i < segFiles.length - 1; i++) {
      const a = i === 0 ? `v${i}` : `xf${i-1}`;
      const b = `v${i+1}`;
      const out = `xf${i}`;
      filter += `[${a}][${b}]xfade=transition=fade:duration=${transitionSeconds}:offset=${offset}[${out}];`;
      lastLabel = out;
      offset += displaySeconds - transitionSeconds;
    }
    mapVideoLabel = lastLabel ? `-map "[${lastLabel}]"` : `-map 0:v`;
    // Build full command
    const musicInput = musicPath ? `-i "${musicPath}"` : '';
    // If music exists, we'll map audio and set -shortest to stop when video ends.
    const audioMap = musicPath ? '-map ' + (segFiles.length) + ':a -c:a aac -b:a 128k -shortest' : '';
    const cmd = `ffmpeg -y ${inputs} ${musicInput} -filter_complex "${filter}" ${mapVideoLabel} -c:v libx264 -preset veryfast -crf 20 ${audioMap} -pix_fmt yuv420p "${outPath}"`;
    execSync(cmd, { stdio: 'inherit', shell: true });
  }

  // Cleanup tmp files if desired
  // fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Example usage:
// makeCinematicReel(['img1.jpg','img2.jpg','img3.jpg'],'bgmusic.mp3','final_reel.mp4');
