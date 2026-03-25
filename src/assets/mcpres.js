// MCPresPluto — Slide engine for Pluto notebooks
// Uses Shadow DOM for complete CSS isolation from Pluto

(function() {
    "use strict";

    var slides = [];
    var currentSlide = 0;
    var currentFragment = 0;
    var observer = null;
    var isSlideMode = false;
    var reapplyScheduled = false;
    var suppressObserver = false;

    // Shadow DOM state
    var viewportEl = null;
    var shadowRoot = null;
    var contentEl = null;

    // --- Initialization ---

    function waitForPluto() {
        var cells = document.querySelectorAll("pluto-cell");
        if (cells.length > 0) {
            init();
        } else {
            requestAnimationFrame(waitForPluto);
        }
    }

    function init() {
        // Clean up any stale viewport from a previous script instance
        var stale = document.getElementById("mcpres-viewport");
        if (stale) stale.parentNode.removeChild(stale);

        watchToggle();
    }

    // --- Toggle ---

    function watchToggle() {
        var checkbox = document.getElementById("mcpres-toggle-input");
        if (checkbox && !checkbox._mcpresWatched) {
            checkbox._mcpresWatched = true;
            checkbox.addEventListener("change", function() {
                if (checkbox.checked) enterSlideMode();
                else exitSlideMode();
            });
        }

        setInterval(function() {
            var cb = document.getElementById("mcpres-toggle-input");
            if (cb && !cb._mcpresWatched) {
                cb._mcpresWatched = true;
                cb.addEventListener("change", function() {
                    if (cb.checked) enterSlideMode();
                    else exitSlideMode();
                });
                if (isSlideMode) cb.checked = true;
            }
        }, 1000);
    }

    // --- Shadow DOM construction ---

    function getShadowOverrideCSS() {
        return [
            // Content container fills viewport
            "#mcpres-content { width: 100vw; height: 100vh; overflow: hidden; position: relative; }",

            // Slide fills content area with responsive font
            "#mcpres-content .mcpres-slide { width: 100vw; height: 100vh; overflow: hidden; position: relative; background: white; font-size: clamp(8pt, 1.4vw, 16pt); }",

            // Single slide content — leave room for title + footer
            "#mcpres-content .mcpres-content-single { height: calc(100vh - 4.5em); overflow: hidden; padding-top: 0.3em; }",

            // Double panels — fill available height; stretch so children get a height reference
            "#mcpres-content .mcpres-double-panels { height: calc(100vh - 4.5em); grid-template-columns: 47fr 2px 53fr; align-items: stretch; }",
            "#mcpres-content .mcpres-panel-left, #mcpres-content .mcpres-panel-right { min-height: 0; }",

            // Blank slide — full viewport, constrain children
            "#mcpres-content .mcpres-content-blank { height: 100vh; width: 100vw; }",
            "#mcpres-content .mcpres-content-blank > * { max-height: 100%; max-width: 100%; }",

            // Footer
            "#mcpres-footer { display: flex; position: fixed; bottom: 0; left: 0; right: 0; height: 2em; align-items: center; padding: 0 0.65em; font-family: 'Cabin', sans-serif; font-size: clamp(5pt, 0.85vw, 9pt); color: var(--mcpres-colour); opacity: var(--mcpres-page-opacity, 0.45); z-index: 1000; background: transparent; pointer-events: none; }",
            "#mcpres-footer.mcpres-footer-hidden { display: none; }",
            "#mcpres-footer-left { flex: 1; text-align: left; }",
            "#mcpres-footer-center { flex: 0; width: 0; }",
            "#mcpres-footer-right { flex: 1; text-align: right; padding-right: 0.3em; }",

            // Navigation controls
            "#mcpres-nav { display: flex; position: fixed; bottom: 2.2em; right: 0.5em; gap: 0.3em; z-index: 1001; opacity: 0; transition: opacity 0.3s; }",
            "#mcpres-nav:hover, #mcpres-nav.mcpres-nav-visible { opacity: 1; }",
            "#mcpres-nav button { background: rgba(255,255,255,0.9); border: 1px solid var(--mcpres-colour); color: var(--mcpres-colour); cursor: pointer; font-size: 0.75em; padding: 0.2em 0.6em; border-radius: 3px; font-family: 'Cabin', sans-serif; pointer-events: auto; }",
            "#mcpres-nav button:hover { background: var(--mcpres-colour); color: white; }",

            // Images and SVGs — fit within their container, never overflow
            "#mcpres-content .mcpres-slide img, #mcpres-content .mcpres-slide svg { max-width: 100%; max-height: 100%; height: auto; object-fit: contain; display: block; }",

            // Overlays fill the content area so images inherit the right max-height
            "#mcpres-content .mcpres-content-single .mcpres-overlay, #mcpres-content .mcpres-panel-left .mcpres-overlay, #mcpres-content .mcpres-panel-right .mcpres-overlay { height: 100%; }",
            "#mcpres-content .mcpres-content-blank .mcpres-overlay { max-height: 100%; }",

            // KaTeX sizing inside slides
            ".mcpres-slide .katex { font-size: 1.1em; }"
        ].join("\n");
    }

    function buildShadowDOM() {
        // Create full-viewport overlay
        viewportEl = document.createElement("div");
        viewportEl.id = "mcpres-viewport";
        viewportEl.style.cssText = "position:fixed;inset:0;z-index:99999;background:white;overflow:hidden;";
        document.body.appendChild(viewportEl);

        // Attach shadow root
        shadowRoot = viewportEl.attachShadow({ mode: "open" });

        // Inject Google Fonts link
        var fontLink = document.createElement("link");
        fontLink.rel = "stylesheet";
        fontLink.href = "https://fonts.googleapis.com/css2?family=Cabin:ital,wght@0,400;0,700;1,400;1,700&display=swap";
        shadowRoot.appendChild(fontLink);

        // Clone KaTeX stylesheets into shadow root
        var links = document.querySelectorAll('link[rel="stylesheet"]');
        for (var i = 0; i < links.length; i++) {
            var href = links[i].getAttribute("href") || "";
            if (href.indexOf("katex") !== -1) {
                shadowRoot.appendChild(links[i].cloneNode(true));
            }
        }
        // Also clone any inline <style> tags containing KaTeX rules
        var styles = document.querySelectorAll("style");
        for (var s = 0; s < styles.length; s++) {
            if (styles[s].textContent.indexOf(".katex") !== -1) {
                shadowRoot.appendChild(styles[s].cloneNode(true));
            }
        }

        // Clone our mcpres CSS (find by CSS variable marker)
        var docStyles = document.querySelectorAll("style");
        for (var m = 0; m < docStyles.length; m++) {
            if (docStyles[m].textContent.indexOf("--mcpres-colour") !== -1) {
                shadowRoot.appendChild(docStyles[m].cloneNode(true));
                break;
            }
        }

        // Inject shadow-specific overrides
        var overrideStyle = document.createElement("style");
        overrideStyle.textContent = getShadowOverrideCSS();
        shadowRoot.appendChild(overrideStyle);

        // Create content container
        contentEl = document.createElement("div");
        contentEl.id = "mcpres-content";
        shadowRoot.appendChild(contentEl);

        // Create footer
        var footer = document.createElement("div");
        footer.id = "mcpres-footer";
        footer.innerHTML =
            '<div id="mcpres-footer-left"></div>' +
            '<div id="mcpres-footer-center"></div>' +
            '<div id="mcpres-footer-right"></div>';
        shadowRoot.appendChild(footer);

        // Populate footer from config
        var config = document.getElementById("mcpres-config");
        if (config) {
            var author = config.dataset.author || "";
            var place = config.dataset.place || "";
            var date = config.dataset.date || "";
            var parts = [author, place, date].filter(function(s) { return s; });
            var left = footer.querySelector("#mcpres-footer-left");
            if (left) left.textContent = parts.join(", ");
        }

        // Create navigation buttons
        var nav = document.createElement("div");
        nav.id = "mcpres-nav";
        nav.innerHTML =
            '<button id="mcpres-prev" title="Previous">\u25C0</button>' +
            '<button id="mcpres-next" title="Next">\u25B6</button>';
        shadowRoot.appendChild(nav);

        nav.querySelector("#mcpres-prev").addEventListener("click", function() { changeSlide(-1); });
        nav.querySelector("#mcpres-next").addEventListener("click", function() { changeSlide(1); });

        // Mouse hover for nav visibility
        viewportEl.addEventListener("mousemove", function(e) {
            if (e.clientY > window.innerHeight - 60) {
                nav.classList.add("mcpres-nav-visible");
            } else {
                nav.classList.remove("mcpres-nav-visible");
            }
        });
    }

    // --- Enter / Exit slide mode ---

    function enterSlideMode() {
        isSlideMode = true;
        suppressObserver = true;
        gatherSlides();
        buildShadowDOM();
        currentSlide = 0;
        currentFragment = 0;
        showSlide(0, 0);
        suppressObserver = false;
        setupObserver();
        document.addEventListener("keydown", handleKey);
    }

    function exitSlideMode() {
        isSlideMode = false;
        suppressObserver = true;

        // Return current slide to its Pluto cell before destroying viewport
        returnCurrentSlide();

        // Remove viewport overlay
        if (viewportEl && viewportEl.parentNode) {
            viewportEl.parentNode.removeChild(viewportEl);
        }
        viewportEl = null;
        shadowRoot = null;
        contentEl = null;

        if (observer) {
            observer.disconnect();
            observer = null;
        }
        document.removeEventListener("keydown", handleKey);

        var cb = document.getElementById("mcpres-toggle-input");
        if (cb) cb.checked = false;
        suppressObserver = false;
    }

    // --- Slide gathering ---

    function countFragments(slideDiv) {
        var maxFragment = 0;

        var pauses = slideDiv.querySelectorAll(".mcpres-pause");
        maxFragment = pauses.length;

        var overlays = slideDiv.querySelectorAll(".mcpres-overlay");
        for (var i = 0; i < overlays.length; i++) {
            var from = parseInt(overlays[i].getAttribute("data-mcpres-from") || "0", 10);
            var to = parseInt(overlays[i].getAttribute("data-mcpres-to") || "9999", 10);
            if (from > maxFragment) maxFragment = from;
            if (to < 9999 && to > maxFragment) maxFragment = to;
        }

        return maxFragment;
    }

    function gatherSlides() {
        slides = [];
        var allCells = document.querySelectorAll("pluto-cell");
        var pageCounter = 1;

        for (var i = 0; i < allCells.length; i++) {
            var cell = allCells[i];
            var slideDiv = cell.querySelector("[data-mcpres-slide]");
            var partDiv = cell.querySelector("[data-mcpres-slide-part]");

            // slide_part() cells belong to the previous slide
            if (!slideDiv && partDiv && slides.length > 0) {
                slides[slides.length - 1].extraCells.push(cell);
                continue;
            }

            if (slideDiv) {
                var type = slideDiv.getAttribute("data-mcpres-slide");
                var slideObj = {
                    cells: [cell],
                    extraCells: [],
                    type: type,
                    element: slideDiv,
                    originParent: slideDiv.parentNode,
                    originNextSibling: slideDiv.nextSibling,
                    pageNum: 0,
                    pageNum2: null,
                    fragments: 0
                };

                if (type === "single") {
                    slideObj.pageNum = pageCounter;
                    pageCounter++;
                } else if (type === "double") {
                    slideObj.pageNum = pageCounter;
                    pageCounter++;
                    slideObj.pageNum2 = pageCounter;
                    pageCounter++;
                } else if (type === "static-double") {
                    if (slides.length > 0) {
                        var prev = slides[slides.length - 1];
                        var prevLeftTitle = prev.element.querySelector(".mcpres-title-left");
                        var curLeftTitle = slideDiv.querySelector(".mcpres-title-left");
                        if (prevLeftTitle && curLeftTitle &&
                            prevLeftTitle.textContent.trim() === curLeftTitle.textContent.trim() &&
                            (prev.type === "double" || prev.type === "static-double")) {
                            slideObj.pageNum = prev.pageNum;
                            slideObj.pageNum2 = pageCounter;
                            pageCounter++;
                        } else {
                            slideObj.pageNum = pageCounter;
                            pageCounter++;
                            slideObj.pageNum2 = pageCounter;
                            pageCounter++;
                        }
                    } else {
                        slideObj.pageNum = pageCounter;
                        pageCounter++;
                        slideObj.pageNum2 = pageCounter;
                        pageCounter++;
                    }
                }
                // blank: no page number, no increment

                slideObj.fragments = countFragments(slideDiv);
                slides.push(slideObj);
            }
        }
    }

    // --- Return current slide to its original location in the Pluto DOM ---

    function returnCurrentSlide() {
        if (currentSlide < 0 || currentSlide >= slides.length) return;
        var slide = slides[currentSlide];
        var el = slide.element;

        // Only act if the element is currently inside our shadow root
        if (!contentEl || !contentEl.contains(el)) return;

        // Reset any fragment/overlay inline styles before returning
        resetFragmentStyles(el);

        // Check if Pluto re-rendered this cell (a new slide element appeared)
        var plutoCell = slide.cells[0];
        var newSlideInCell = plutoCell.querySelector("[data-mcpres-slide]");

        if (newSlideInCell) {
            // Pluto re-rendered — discard old element, new one is in the cell
            el.parentNode.removeChild(el);
        } else {
            // Normal case — put element back where it came from
            try {
                if (slide.originNextSibling && slide.originNextSibling.parentNode === slide.originParent) {
                    slide.originParent.insertBefore(el, slide.originNextSibling);
                } else if (slide.originParent && slide.originParent.parentNode) {
                    slide.originParent.appendChild(el);
                }
            } catch (e) {
                // Parent structure changed — just remove from shadow root
                if (el.parentNode) el.parentNode.removeChild(el);
            }
        }

        // Restore extra cells (slide_part cells) — remove fixed positioning
        for (var i = 0; i < slide.extraCells.length; i++) {
            var ecell = slide.extraCells[i];
            if (ecell._mcpresOrigStyle !== undefined) {
                ecell.style.cssText = ecell._mcpresOrigStyle;
                delete ecell._mcpresOrigStyle;
            }
        }
    }

    function resetFragmentStyles(element) {
        // Reset pause-hidden siblings
        var pauses = element.querySelectorAll(".mcpres-pause");
        for (var idx = 0; idx < pauses.length; idx++) {
            var sibling = pauses[idx].nextElementSibling;
            while (sibling && !sibling.classList.contains("mcpres-pause")) {
                sibling.style.display = "";
                sibling = sibling.nextElementSibling;
            }
        }
        // Reset overlays
        var overlays = element.querySelectorAll(".mcpres-overlay");
        for (var i = 0; i < overlays.length; i++) {
            overlays[i].style.display = "";
            overlays[i].style.visibility = "";
        }
    }

    // --- Show slide (move real element into shadow root) ---

    function showSlide(index, fragmentIndex) {
        if (slides.length === 0 || !shadowRoot || !contentEl) return;
        if (index < 0 || index >= slides.length) return;

        suppressObserver = true;

        // Return previous slide to its Pluto cell
        returnCurrentSlide();

        currentSlide = index;
        currentFragment = (typeof fragmentIndex === "number") ? fragmentIndex : 0;

        // Move the real slide element into shadow root (preserves event handlers)
        var slide = slides[currentSlide];
        contentEl.appendChild(slide.element);

        // Apply fragments and overlays on the real element
        applyFragments(slide.element, currentFragment);
        applyOverlays(slide.element, currentFragment);

        // Position extra cells (slide_part) above the viewport overlay.
        // They stay in the main DOM so Pluto bonds keep working.
        for (var i = 0; i < slide.extraCells.length; i++) {
            var cell = slide.extraCells[i];
            cell._mcpresOrigStyle = cell.style.cssText;
            cell.style.cssText =
                "position:fixed !important;" +
                "z-index:100000 !important;" +
                "bottom:2.5em !important;" +
                "left:50% !important;" +
                "transform:translateX(-50%) !important;" +
                "width:auto !important;" +
                "max-width:60vw !important;" +
                "margin:0 !important;" +
                "padding:0.2em 1em !important;" +
                "background:transparent !important;" +
                "border:none !important;" +
                "box-shadow:none !important;" +
                "font-family:'Cabin',sans-serif !important;" +
                "font-size:clamp(7pt,1vw,11pt) !important;" +
                "color:var(--mcpres-colour) !important;" +
                "opacity:0.7 !important;";
        }

        // Update footer
        updateFooter(slide);

        suppressObserver = false;
    }

    // --- Fragment system (pause markers) ---

    function applyFragments(element, fragmentIndex) {
        var pauses = element.querySelectorAll(".mcpres-pause");

        for (var idx = 0; idx < pauses.length; idx++) {
            var marker = pauses[idx];
            var shouldShow = (idx < fragmentIndex);

            var sibling = marker.nextElementSibling;
            while (sibling && !sibling.classList.contains("mcpres-pause")) {
                if (shouldShow) {
                    sibling.style.display = "";
                } else {
                    sibling.style.display = "none";
                }
                sibling = sibling.nextElementSibling;
            }
        }
    }

    // --- Overlay system ---

    function applyOverlays(element, fragmentIndex) {
        var overlays = element.querySelectorAll(".mcpres-overlay");

        for (var i = 0; i < overlays.length; i++) {
            var el = overlays[i];
            var from = parseInt(el.getAttribute("data-mcpres-from") || "0", 10);
            var to = parseInt(el.getAttribute("data-mcpres-to") || "9999", 10);

            if (fragmentIndex >= from && fragmentIndex <= to) {
                el.style.display = "";
                el.style.visibility = "";
            } else {
                el.style.display = "none";
            }
        }
    }

    // --- Footer ---

    function updateFooter(slide) {
        if (!shadowRoot) return;
        var footer = shadowRoot.querySelector("#mcpres-footer");
        if (!footer) return;

        if (slide.type === "blank") {
            footer.classList.add("mcpres-footer-hidden");
        } else {
            footer.classList.remove("mcpres-footer-hidden");

            var right = shadowRoot.querySelector("#mcpres-footer-right");
            if (right) {
                if ((slide.type === "double" || slide.type === "static-double") && slide.pageNum2 !== null) {
                    right.textContent = slide.pageNum + " - " + slide.pageNum2;
                } else {
                    right.textContent = String(slide.pageNum);
                }
            }
        }
    }

    // --- Navigation ---

    function changeSlide(delta) {
        if (slides.length === 0) return;

        var slide = slides[currentSlide];

        if (delta > 0) {
            if (currentFragment < slide.fragments) {
                currentFragment++;
                showSlide(currentSlide, currentFragment);
            } else if (currentSlide < slides.length - 1) {
                showSlide(currentSlide + 1, 0);
            }
        } else if (delta < 0) {
            if (currentFragment > 0) {
                currentFragment--;
                showSlide(currentSlide, currentFragment);
            } else if (currentSlide > 0) {
                var prev = slides[currentSlide - 1];
                showSlide(currentSlide - 1, prev.fragments);
            }
        }
    }

    function handleKey(e) {
        var tag = e.target.tagName;
        if (tag === "TEXTAREA" || tag === "INPUT" || e.target.isContentEditable) return;

        switch (e.key) {
            case "ArrowRight":
            case "PageDown":
            case " ":
                e.preventDefault();
                changeSlide(1);
                break;
            case "ArrowLeft":
            case "PageUp":
                e.preventDefault();
                changeSlide(-1);
                break;
            case "Escape":
                e.preventDefault();
                exitSlideMode();
                break;
            case "Home":
                e.preventDefault();
                showSlide(0, 0);
                break;
            case "End":
                e.preventDefault();
                if (slides.length > 0) {
                    var last = slides[slides.length - 1];
                    showSlide(slides.length - 1, last.fragments);
                }
                break;
        }
    }

    // --- MutationObserver ---
    // Watches real DOM for Pluto cell changes, re-gathers slides

    function setupObserver() {
        if (observer) observer.disconnect();

        observer = new MutationObserver(function(mutations) {
            if (!isSlideMode) return;
            if (suppressObserver) return;
            if (reapplyScheduled) return;

            // Only react to actual node additions/removals outside our viewport
            var dominated = true;
            for (var i = 0; i < mutations.length; i++) {
                var m = mutations[i];
                if (viewportEl && viewportEl.contains(m.target)) continue;
                if (m.type === "childList" && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
                    dominated = false;
                    break;
                }
            }
            if (dominated) return;

            reapplyScheduled = true;
            requestAnimationFrame(function() {
                reapplyScheduled = false;
                if (!isSlideMode) return;

                suppressObserver = true;

                // Return current slide to DOM (or discard if Pluto re-rendered)
                returnCurrentSlide();
                gatherSlides();
                if (currentSlide < slides.length) {
                    showSlide(currentSlide, currentFragment);
                } else if (slides.length > 0) {
                    showSlide(slides.length - 1, 0);
                }
                suppressObserver = false;
            });
        });

        requestAnimationFrame(function() {
            if (isSlideMode && observer) {
                observer.observe(document.body, { childList: true, subtree: true });
            }
        });
    }

    // --- Start ---
    waitForPluto();

})();
