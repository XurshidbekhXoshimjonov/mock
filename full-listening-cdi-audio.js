(() => {
    const partAudioSources = {
        1: "/uploads/audio/1780586439693-p1_2_.mp3",
        2: "/uploads/audio/1780586481840-p2.mp3",
        3: "/uploads/audio/1780586489511-p3.mp3",
        4: "/uploads/audio/1780586494492-p4.mp3"
    };
    const audio = document.getElementById("global-audio-player");
    const playPauseButton = document.getElementById("play-pause-btn");
    const progressBar = document.getElementById("progress-bar");
    const currentTime = document.getElementById("current-time");
    const totalDuration = document.getElementById("total-duration");
    const volumeButton = document.getElementById("volume-btn");
    const volumeSlider = document.getElementById("new-volume-slider");
    const speedButton = document.getElementById("speed-btn");
    const speedOptions = document.getElementById("speed-options");
    const startButton = document.getElementById("start-listening-btn");
    const submitButton = document.getElementById("top-submit-button");
    const timerDisplay = document.querySelector(".timer-display");
    let started = false;
    let timerStarted = false;
    let remainingSeconds = 40 * 60;
    let timerId = null;

    function formatTime(value) {
        const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }

    function updatePlayButton() {
        playPauseButton.textContent = audio.paused ? "Play" : "Pause";
    }

    function updateTimer() {
        timerDisplay.textContent = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;
    }

    function startTimer() {
        if (timerStarted) return;
        timerStarted = true;
        timerId = window.setInterval(() => {
            if (remainingSeconds > 0) remainingSeconds -= 1;
            updateTimer();
            if (!remainingSeconds) {
                window.clearInterval(timerId);
                document.getElementById("deliver-button")?.click();
            }
        }, 1000);
    }

    function loadPartAudio(partNumber) {
        const source = partAudioSources[partNumber];
        if (!source || audio.dataset.part === String(partNumber)) return;
        audio.pause();
        started = false;
        audio.src = source;
        audio.dataset.part = String(partNumber);
        audio.load();
        playPauseButton.disabled = true;
        startButton.disabled = false;
        startButton.textContent = "Start Listening Test";
        progressBar.value = 0;
        currentTime.textContent = "00:00";
        totalDuration.textContent = "00:00";
        updatePlayButton();
    }

    const originalSwitchToPart = window.switchToPart;
    window.switchToPart = function switchToPartWithAudio(partNumber) {
        originalSwitchToPart(partNumber);
        loadPartAudio(partNumber);
    };

    playPauseButton.addEventListener("click", () => {
        if (!started) return;
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
    });
    startButton.addEventListener("click", () => {
        if (started) return;
        started = true;
        startButton.disabled = true;
        startButton.textContent = "Listening Test Started";
        playPauseButton.disabled = false;
        startTimer();
        audio.currentTime = 0;
        audio.play().catch(() => {
            started = false;
            startButton.disabled = false;
            startButton.textContent = "Start Listening Test";
            playPauseButton.disabled = true;
        });
    });
    submitButton.addEventListener("click", () => {
        document.getElementById("deliver-button")?.click();
    });
    audio.addEventListener("play", updatePlayButton);
    audio.addEventListener("pause", updatePlayButton);
    audio.addEventListener("loadedmetadata", () => {
        progressBar.max = Math.floor(audio.duration) || 0;
        totalDuration.textContent = formatTime(audio.duration);
    });
    audio.addEventListener("timeupdate", () => {
        progressBar.value = Math.floor(audio.currentTime);
        currentTime.textContent = formatTime(audio.currentTime);
    });
    progressBar.addEventListener("input", () => {
        audio.currentTime = Number(progressBar.value) || 0;
    });
    volumeSlider.addEventListener("input", () => {
        audio.volume = Number(volumeSlider.value);
        audio.muted = false;
    });
    volumeButton.addEventListener("click", () => {
        audio.muted = !audio.muted;
    });
    speedButton.addEventListener("click", () => {
        speedOptions.classList.toggle("hidden");
    });
    speedOptions.addEventListener("click", (event) => {
        const option = event.target.closest("[data-speed]");
        if (!option) return;
        audio.playbackRate = Number(option.dataset.speed) || 1;
        speedButton.textContent = `${audio.playbackRate}x`;
        speedOptions.classList.add("hidden");
    });

    audio.volume = Number(volumeSlider.value);
    updateTimer();
    loadPartAudio(1);
})();
