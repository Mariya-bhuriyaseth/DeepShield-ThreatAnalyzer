/* analyzer-page.js -- powers analyzer.html (fully client-side, no backend) */

document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll("#scanTypeTabs .ds-tab-pill");
  const panels = document.querySelectorAll(".scan-panel");
  const scanTypeInput = document.getElementById("scanTypeInput");

  const form = document.getElementById("analyzeForm");
  const formError = document.getElementById("formError");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const analyzeBtnIdle = document.getElementById("analyzeBtnIdle");
  const analyzeBtnLoading = document.getElementById("analyzeBtnLoading");

  const resultSection = document.getElementById("resultSection");
  const resultRingHolder = document.getElementById("resultRingHolder");
  const resultBadgeHolder = document.getElementById("resultBadgeHolder");
  const resultHeadline = document.getElementById("resultHeadline");
  const resultInputEcho = document.getElementById("resultInputEcho");
  const resultReasons = document.getElementById("resultReasons");
  const resultAdvice = document.getElementById("resultAdvice");
  const scanAnotherBtn = document.getElementById("scanAnotherBtn");

  const qrDropzone = document.getElementById("qrDropzone");
  const qrFileInput = document.getElementById("qrFileInput");
  const qrPreviewWrap = document.getElementById("qrPreviewWrap");
  const qrPreviewImg = document.getElementById("qrPreviewImg");
  const qrDropzoneEmpty = document.getElementById("qrDropzoneEmpty");

  // ---- Tab switching -----------------------------------------------------
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const type = btn.dataset.scanType;
      scanTypeInput.value = type;
      panels.forEach((p) => p.classList.toggle("d-none", p.dataset.panel !== type));
      hideError();
      resultSection.classList.add("d-none");
    });
  });

  // ---- QR dropzone --------------------------------------------------------
  qrDropzone.addEventListener("click", () => qrFileInput.click());

  ["dragover", "dragenter"].forEach((evt) =>
    qrDropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      qrDropzone.classList.add("is-dragover");
    })
  );
  ["dragleave", "dragend", "drop"].forEach((evt) =>
    qrDropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      qrDropzone.classList.remove("is-dragover");
    })
  );
  qrDropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) {
      qrFileInput.files = e.dataTransfer.files;
      previewQrFile(file);
    }
  });
  qrFileInput.addEventListener("change", () => {
    const file = qrFileInput.files[0];
    if (file) previewQrFile(file);
  });

  function previewQrFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      qrPreviewImg.src = e.target.result;
      qrPreviewWrap.classList.remove("d-none");
      qrDropzoneEmpty.classList.add("d-none");
    };
    reader.readAsDataURL(file);
  }

  // ---- Client-side QR decoding (uses the jsQR library loaded via CDN) ----
  function decodeQrFromFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          let imageData;
          try {
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          } catch (err) {
            resolve(null);
            return;
          }

          if (typeof window.jsQR !== "function") {
            resolve(null);
            return;
          }

          const result = window.jsQR(imageData.data, canvas.width, canvas.height);
          resolve(result ? result.data : null);
        };
        img.onerror = () => resolve(null);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  // ---- Helpers -------------------------------------------------------------
  function showError(message) {
    formError.textContent = message;
    formError.classList.remove("d-none");
  }
  function hideError() {
    formError.classList.add("d-none");
  }
  function setLoading(isLoading) {
    analyzeBtn.disabled = isLoading;
    analyzeBtnIdle.classList.toggle("d-none", isLoading);
    analyzeBtnLoading.classList.toggle("d-none", !isLoading);
  }

  // ---- Submit ---------------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const scanType = scanTypeInput.value;
    setLoading(true);
    resultSection.classList.add("d-none");

    try {
      let result;
      let fullInput;

      if (scanType === "url") {
        const val = document.getElementById("urlInput").value.trim();
        if (!val) {
          showError("Please paste a link to analyze.");
          setLoading(false);
          return;
        }
        result = runAnalysis("url", val);
        fullInput = val;
      } else if (scanType === "text") {
        const val = document.getElementById("textInput").value.trim();
        if (!val) {
          showError("Please paste a message to analyze.");
          setLoading(false);
          return;
        }
        result = runAnalysis("text", val);
        fullInput = val;
      } else {
        const file = qrFileInput.files[0];
        const manual = document.getElementById("qrTextInput").value.trim();
        let decoded = null;

        if (file) {
          decoded = await decodeQrFromFile(file);
        }
        if (!decoded && manual) {
          decoded = manual;
        }
        if (!decoded) {
          showError("No QR code could be detected. Try a clearer image, or paste the decoded text/link manually.");
          setLoading(false);
          return;
        }
        result = runAnalysis("qr", decoded);
        fullInput = decoded;
      }

      saveScan(result, fullInput);
      renderResult(result);
      dsToast("Scan complete — saved to dashboard history.", "success");
    } catch (err) {
      showError("Something went wrong while analyzing. Please try again.");
    } finally {
      setLoading(false);
    }
  });

  function renderResult(data) {
    resultRingHolder.innerHTML = dsScanRingMarkup(data.risk_score, data.risk_level_key);
    resultBadgeHolder.innerHTML = dsRiskBadgeMarkup(data.risk_level_key, data.risk_level);

    const typeLabel = { url: "Link", text: "Message", qr: "QR code" }[data.scan_type] || "Input";
    resultHeadline.textContent = `${typeLabel} scored ${data.risk_score} / 100 — ${data.risk_level}`;
    resultInputEcho.textContent = data.input;

    resultReasons.innerHTML = data.reasons
      .map((r) => `<li><i class="bi bi-dot"></i><span>${dsEscapeHtml(r)}</span></li>`)
      .join("");
    resultAdvice.innerHTML = data.advice
      .map((a) => `<li><i class="bi bi-check2"></i><span>${dsEscapeHtml(a)}</span></li>`)
      .join("");

    resultSection.classList.remove("d-none");
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  scanAnotherBtn.addEventListener("click", () => {
    form.reset();
    qrPreviewWrap.classList.add("d-none");
    qrDropzoneEmpty.classList.remove("d-none");
    resultSection.classList.add("d-none");
    hideError();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});
