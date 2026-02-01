const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ log: true });

async function createVideo() {
  const files = document.getElementById("images").files;
  const status = document.getElementById("status");
  const download = document.getElementById("download");

  if (files.length === 0) {
    alert("Please select images");
    return;
  }

  status.innerText = "Loading video engine...";
  if (!ffmpeg.isLoaded()) await ffmpeg.load();

  // Write images
  for (let i = 0; i < files.length; i++) {
    ffmpeg.FS("writeFile", `img${i}.jpg`, await fetchFile(files[i]));
  }

  // Create input.txt for slideshow
  let txt = "";
  for (let i = 0; i < files.length; i++) {
    txt += `file img${i}.jpg\n`;
    txt += `duration 2\n`;
  }
  txt += `file img${files.length - 1}.jpg\n`;

  ffmpeg.FS("writeFile", "input.txt", new TextEncoder().encode(txt));

  status.innerText = "Creating cinematic reel...";

  await ffmpeg.run(
    "-f", "concat",
    "-safe", "0",
    "-i", "input.txt",
    "-vf",
    "scale=1080:1920,zoompan=z='zoom+0.0005':d=60,fade=t=in:st=0:d=1,fade=t=out:st=1:d=1",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "output.mp4"
  );

  const data = ffmpeg.FS("readFile", "output.mp4");
  const videoURL = URL.createObjectURL(
    new Blob([data.buffer], { type: "video/mp4" })
  );

  download.href = videoURL;
  download.download = "cinematic_reel.mp4";
  download.style.display = "block";
  download.innerText = "⬇ Download Cinematic Reel";

  status.innerText = "Done 🎉";
}
