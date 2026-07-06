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
    var isPrintMode = false;

    // Shadow DOM state
    var viewportEl = null;
    var shadowRoot = null;
    var contentEl = null;
    // Light-DOM sibling of viewportEl that hosts externalized PlutoPlotly
    // containers — they cannot live inside viewportEl (shadow host's light
    // children are not rendered) and need a stable parent so the
    // MutationObserver can ignore Plotly's internal subtree mutations.
    var plotLayerEl = null;
    // The slide element currently shown IN PLACE (light DOM, not moved into the
    // shadow) because it contains a live WGLMakie/Bonito figure that cannot be
    // relocated without Pluto re-rendering it. The observer ignores its subtree.
    var inPlaceEl = null;

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
        var staleLayer = document.getElementById("mcpres-plot-layer");
        if (staleLayer) staleLayer.parentNode.removeChild(staleLayer);

        watchToggle();
        watchExportButton();
        watchExportHtmlButton();
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

    // --- Export PDF button ---
    // Wires the in-notebook button to enterPrintMode() + window.print(),
    // restoring the notebook view once the print dialog closes.

    function watchExportButton() {
        var attach = function() {
            var btn = document.getElementById("mcpres-export-pdf");
            if (btn && !btn._mcpresWatched) {
                btn._mcpresWatched = true;
                btn.addEventListener("click", function() {
                    enterPrintMode();
                    // Two RAFs so the print layout is painted before the dialog opens
                    requestAnimationFrame(function() {
                        requestAnimationFrame(function() {
                            var afterPrint = function() {
                                exitPrintMode(false);
                                window.removeEventListener("afterprint", afterPrint);
                            };
                            window.addEventListener("afterprint", afterPrint);
                            window.print();
                        });
                    });
                });
            }
        };
        attach();
        setInterval(attach, 1000);
    }

    // --- Export HTML button ---
    // Triggers a browser download of Pluto's /notebookexport?id=... endpoint
    // (the same artifact that MCPresPluto.export_html fetches from Julia).

    function watchExportHtmlButton() {
        var attach = function() {
            var btn = document.getElementById("mcpres-export-html");
            if (btn && !btn._mcpresWatched) {
                btn._mcpresWatched = true;
                btn.addEventListener("click", function() {
                    var params = new URLSearchParams(window.location.search);
                    var id = params.get("id");
                    if (!id) {
                        alert("Could not detect notebook id from URL.\n" +
                              "Expected format: /edit?id=NOTEBOOK_ID");
                        return;
                    }
                    var secret = params.get("secret");
                    var url = "/notebookexport?id=" + encodeURIComponent(id);
                    if (secret) url += "&secret=" + encodeURIComponent(secret);
                    var a = document.createElement("a");
                    a.href = url;
                    a.download = "slides.html";
                    a.style.display = "none";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                });
            }
        };
        attach();
        setInterval(attach, 1000);
    }

    // --- Shadow DOM construction ---

    function getShadowOverrideCSS() {
        return [
            // Slide box sized to fit the viewport at --mcpres-aspect (width/height),
            // defined once on the shadow host so footer/nav (siblings of
            // #mcpres-content) can reference it. Width = aspect * height, capped by
            // whichever viewport dimension is the binding constraint.
            ":host { --slide-w: min(100vw, calc(var(--mcpres-aspect) * 100vh)); --slide-h: min(calc(100vw / var(--mcpres-aspect)), 100vh); }",

            // Content container fills viewport and centers the slide box
            "#mcpres-content { width: 100vw; height: 100vh; overflow: hidden; position: relative; display: flex; align-items: center; justify-content: center; }",

            // Slide is a centered box at the configured aspect ratio; font scales
            // with the box (no vw cap) so content keeps scaling proportionally at
            // any screen size.
            "#mcpres-content .mcpres-slide { width: var(--slide-w); height: var(--slide-h); overflow: hidden; position: relative; background: white; font-size: calc(var(--slide-w) * 0.014); }",

            // Header (title bar) scaled up over the base 1.25em
            "#mcpres-content .mcpres-title-bar, #mcpres-content .mcpres-title-left, #mcpres-content .mcpres-title-right { font-size: 1.8em; }",

            // Single slide content — leave room for title + footer
            "#mcpres-content .mcpres-content-single { height: calc(100% - 4.5em); overflow: hidden; padding-top: 0.3em; }",

            // Double panels — fill available height; stretch so children get a height reference
            "#mcpres-content .mcpres-double-panels { height: calc(100% - 4.5em); grid-template-columns: 47fr 2px 53fr; align-items: stretch; }",
            "#mcpres-content .mcpres-panel-left, #mcpres-content .mcpres-panel-right { min-height: 0; }",

            // Blank slide — fill the slide box, constrain children
            "#mcpres-content .mcpres-content-blank { height: 100%; width: 100%; }",
            "#mcpres-content .mcpres-content-blank > * { max-height: 100%; max-width: 100%; }",

            // Footer — anchored to the slide box's bottom edge (offset by the
            // pillar/letterbox margin), not the raw viewport.
            // box-sizing:border-box keeps the footer's rendered width exactly at
            // --slide-w — without it, the horizontal padding below adds on top,
            // overflowing past the slide box's right edge (page number gets cut
            // off) whenever the pillarbox margin is small or zero, which is the
            // common case now that 16:9 often matches the screen's own ratio.
            "#mcpres-footer { display: flex; position: fixed; box-sizing: border-box; bottom: calc((100vh - var(--slide-h)) / 2); left: calc((100vw - var(--slide-w)) / 2); width: var(--slide-w); height: 2em; align-items: center; padding: 0 0.65em; font-family: 'Cabin', sans-serif; font-size: calc(var(--slide-w) * 0.01224); color: var(--mcpres-colour); opacity: var(--mcpres-page-opacity, 0.45); z-index: 1000; background: transparent; pointer-events: none; }",
            "#mcpres-footer.mcpres-footer-hidden { display: none; }",
            "#mcpres-footer-left { flex: 1; text-align: left; }",
            "#mcpres-footer-center { flex: 0; width: 0; }",
            "#mcpres-footer-right { flex: 1; text-align: right; padding-right: 0.3em; }",

            // Navigation controls — anchored to the slide box's bottom-right
            "#mcpres-nav { display: flex; position: fixed; bottom: calc((100vh - var(--slide-h)) / 2 + 2.2em); right: calc((100vw - var(--slide-w)) / 2 + 0.5em); gap: 0.3em; z-index: 1001; opacity: 0; transition: opacity 0.3s; }",
            "#mcpres-nav:hover, #mcpres-nav.mcpres-nav-visible { opacity: 1; }",
            "#mcpres-nav button { background: rgba(255,255,255,0.9); border: 1px solid var(--mcpres-colour); color: var(--mcpres-colour); cursor: pointer; font-size: 0.75em; padding: 0.2em 0.6em; border-radius: 3px; font-family: 'Cabin', sans-serif; pointer-events: auto; }",
            "#mcpres-nav button:hover { background: var(--mcpres-colour); color: white; }",

            // Images and SVGs — fit within their container, never overflow, and
            // stay centered now that the widescreen content area is often much
            // wider than a fixed-size figure (exclude Plotly's .main-svg layers;
            // they're handled below)
            "#mcpres-content .mcpres-slide img, #mcpres-content .mcpres-slide svg:not(.main-svg) { max-width: 100%; max-height: 100%; height: auto; object-fit: contain; display: block; margin: 0 auto; }",

            // Plotly.js stacks several <svg class='main-svg'> layers (bg, plot,
            // infolayer with titles/legend/annotations) using position:absolute
            // via CSS injected into document.head. That CSS doesn't cross the
            // shadow boundary, so without these rules the layers fall into flow
            // layout and axis titles/legend/annotations render below the plot.
            // margin:auto centers fixed-width plot containers within the (now
            // wider) content area.
            "#mcpres-content .js-plotly-plot, #mcpres-content .js-plotly-plot .plot-container { position: relative; margin: 0 auto; }",
            "#mcpres-content .js-plotly-plot .svg-container { position: relative; overflow: hidden; }",
            "#mcpres-content .js-plotly-plot .svg-container > svg.main-svg, #mcpres-content .js-plotly-plot .svg-container > svg { position: absolute; top: 0; left: 0; }",

            // Overlays fill the content area so images inherit the right max-height
            "#mcpres-content .mcpres-content-single .mcpres-overlay, #mcpres-content .mcpres-panel-left .mcpres-overlay, #mcpres-content .mcpres-panel-right .mcpres-overlay { height: 100%; }",
            "#mcpres-content .mcpres-content-blank .mcpres-overlay { max-height: 100%; }",

            // KaTeX sizing inside slides
            ".mcpres-slide .katex { font-size: 1.1em; }"
        ].join("\n");
    }

    // position:fixed on the in-place Makie slide is positioned relative to the
    // viewport ONLY if no ancestor establishes its own containing block (any
    // ancestor with transform/filter/perspective/contain/will-change/backdrop-filter
    // set to a non-default value). WGLMakie/Bonito's own wrapper markup around the
    // canvas can set one of these (observed: the fullscreen slide renders pinned to
    // its normal in-page position instead of centered over the viewport). Rather
    // than depend on knowing exactly which ancestor/library does this, walk up and
    // neutralize any offending ancestor for as long as the slide is shown fullscreen,
    // restoring the original inline style on exit.
    function clearContainingBlockAncestors(el) {
        var cleared = [];
        var node = el.parentElement;
        while (node) {
            var cs = getComputedStyle(node);
            var establishesContainingBlock =
                cs.transform !== "none" ||
                cs.filter !== "none" ||
                cs.perspective !== "none" ||
                (cs.contain && cs.contain !== "none") ||
                (cs.willChange && cs.willChange.indexOf("transform") !== -1) ||
                (cs.backdropFilter && cs.backdropFilter !== "none");
            if (establishesContainingBlock) {
                cleared.push({ node: node, origStyle: node.style.cssText });
                node.style.setProperty("transform", "none", "important");
                node.style.setProperty("filter", "none", "important");
                node.style.setProperty("perspective", "none", "important");
                node.style.setProperty("contain", "none", "important");
                node.style.setProperty("will-change", "auto", "important");
                node.style.setProperty("backdrop-filter", "none", "important");
            }
            if (node === document.documentElement) break;
            node = node.parentElement;
        }
        return cleared;
    }

    function restoreContainingBlockAncestors(cleared) {
        for (var i = 0; i < cleared.length; i++) {
            cleared[i].node.style.cssText = cleared[i].origStyle;
        }
    }

    // Inject (once) the light-DOM CSS that styles an in-place Makie figure slide as
    // a centered fullscreen box (at --mcpres-aspect) over the white viewport overlay.
    // Mirrors the single-slide rules from getShadowOverrideCSS(), but lives in
    // document.head (light DOM) because the figure slide is never moved into the
    // shadow root.
    // NOTE: only translate/positioning is applied to the slide box — the canvas is
    // never CSS-scaled (that would break WGLMakie's fixed winscale → offset clicks).
    function ensureMakieInPlaceCSS() {
        if (document.getElementById("mcpres-makie-inplace-css")) return;
        var style = document.createElement("style");
        style.id = "mcpres-makie-inplace-css";
        style.textContent = [
            ".mcpres-makie-fullscreen {",
            "  position: fixed !important;",
            "  top: 50% !important; left: 50% !important;",
            "  transform: translate(-50%, -50%) !important;",
            "  width: min(100vw, calc(var(--mcpres-aspect) * 100vh)) !important;",
            "  height: min(calc(100vw / var(--mcpres-aspect)), 100vh) !important;",
            "  margin: 0 !important;",
            "  background: white !important;",
            "  overflow: hidden !important;",
            "  z-index: 100001 !important;",
            "  font-size: calc(min(100vw, calc(var(--mcpres-aspect) * 100vh)) * 0.014) !important;",
            "}",
            ".mcpres-makie-fullscreen .mcpres-title-bar,",
            ".mcpres-makie-fullscreen .mcpres-title-left,",
            ".mcpres-makie-fullscreen .mcpres-title-right { font-size: 1.8em !important; }",
            ".mcpres-makie-fullscreen .mcpres-content-single {",
            "  height: calc(100% - 4.5em) !important;",
            "  overflow: hidden !important;",
            "  padding-top: 0.3em !important;",
            "}"
        ].join("\n");
        document.head.appendChild(style);
    }

    function buildShadowDOM() {
        // Create full-viewport overlay
        viewportEl = document.createElement("div");
        viewportEl.id = "mcpres-viewport";
        viewportEl.style.cssText = "position:fixed;inset:0;z-index:99999;background:white;overflow:hidden;";
        document.body.appendChild(viewportEl);

        // Sibling light-DOM layer for externalized Plotly containers.
        // Zero-size anchor — children use position:fixed so layout is unaffected.
        plotLayerEl = document.createElement("div");
        plotLayerEl.id = "mcpres-plot-layer";
        plotLayerEl.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;";
        document.body.appendChild(plotLayerEl);

        // Plotly's updatemenu (Play/Pause) buttons receive mousedown+mouseup but
        // the browser does not synthesize a click — likely because the
        // position:fixed externalization causes a subpixel layout shift during
        // Plotly's mousedown handler and the browser classifies the gesture as
        // a drag. Synthesize the click on mouseup so Plotly's animate handler
        // fires. The slider ticks/drag work without this because they bind to
        // mousedown/mousemove directly, not click.
        plotLayerEl.addEventListener("mouseup", function(e) {
            var btn = e.target && e.target.closest && e.target.closest(".updatemenu-button");
            if (!btn) return;
            btn.dispatchEvent(new MouseEvent("click", {
                bubbles: true,
                composed: true,
                cancelable: true,
                view: window,
                clientX: e.clientX,
                clientY: e.clientY,
                button: 0
            }));
        });

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

    // WGLMakie's check_screen() disposes its WebGL context when
    // document.body.contains(canvas) is false, but Node.contains() does not pierce
    // shadow boundaries. While in slide mode, treat any connected node (isConnected
    // traverses shadow trees) as contained by body, so externalized figures — and
    // figures transiently re-entering the shadow overlay during navigation — are
    // never torn down. Scoped to document.body only; MCPresPluto's own containment
    // checks use contentEl/viewportEl/plotLayerEl, so they are unaffected.
    function installContainsShim() {
        if (Object.prototype.hasOwnProperty.call(document.body, "contains")) return;
        var body = document.body;
        body.contains = function(node) {
            if (node && node.isConnected) return true;
            return Node.prototype.contains.call(body, node);
        };
    }

    function uninstallContainsShim() {
        if (Object.prototype.hasOwnProperty.call(document.body, "contains")) {
            delete document.body.contains;
        }
    }

    function enterSlideMode() {
        isSlideMode = true;
        installContainsShim();
        suppressObserver = true;
        gatherSlides();
        buildShadowDOM();
        currentSlide = 0;
        currentFragment = 0;
        showSlide(0, 0);
        suppressObserver = false;
        setupObserver();
        document.addEventListener("keydown", handleKey);
        window.addEventListener("resize", handleWindowResize);
    }

    function exitSlideMode() {
        isSlideMode = false;
        uninstallContainsShim();
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

        // Remove plot layer (returnCurrentSlide already restored its children)
        if (plotLayerEl && plotLayerEl.parentNode) {
            plotLayerEl.parentNode.removeChild(plotLayerEl);
        }
        plotLayerEl = null;

        if (observer) {
            observer.disconnect();
            observer = null;
        }
        document.removeEventListener("keydown", handleKey);
        window.removeEventListener("resize", handleWindowResize);

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
        var pageCounter = 1;

        // Collect (slideDiv, partDiv, cell) tuples from either live or static DOM
        var allCells = document.querySelectorAll("pluto-cell");
        var entries = []; // {slideDiv, partDiv, cell}

        if (allCells.length > 0) {
            // Live Pluto mode: slides are children of pluto-cell elements
            for (var i = 0; i < allCells.length; i++) {
                var cell = allCells[i];
                entries.push({
                    slideDiv: cell.querySelector("[data-mcpres-slide]"),
                    partDiv:  cell.querySelector("[data-mcpres-slide-part]"),
                    cell: cell
                });
            }
        } else {
            // Static export mode: slide divs are directly in the DOM
            var allSlideDivs = document.querySelectorAll("[data-mcpres-slide]");
            for (var i = 0; i < allSlideDivs.length; i++) {
                entries.push({ slideDiv: allSlideDivs[i], partDiv: null, cell: null });
            }
        }

        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var slideDiv = e.slideDiv;
            var partDiv  = e.partDiv;
            var cell     = e.cell;

            // slide_part() cells belong to the previous slide
            if (!slideDiv && partDiv && slides.length > 0) {
                if (cell) slides[slides.length - 1].extraCells.push(cell);
                continue;
            }

            if (slideDiv) {
                var type = slideDiv.getAttribute("data-mcpres-slide");
                var slideObj = {
                    cells: cell ? [cell] : [],
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

        // In-place Makie figure slide: it was never moved into the shadow, only
        // styled fullscreen. Restore it by removing the class + extra-cell styling;
        // the element stays in its Pluto cell (the figure is never disturbed).
        if (slide._mcpresInPlace) {
            el.classList.remove("mcpres-makie-fullscreen");
            resetFragmentStyles(el);
            if (slide._mcpresClearedAncestors) {
                restoreContainingBlockAncestors(slide._mcpresClearedAncestors);
                slide._mcpresClearedAncestors = null;
            }
            for (var ci = 0; ci < slide.extraCells.length; ci++) {
                var ic = slide.extraCells[ci];
                if (ic._mcpresOrigStyle !== undefined) {
                    ic.style.cssText = ic._mcpresOrigStyle;
                    delete ic._mcpresOrigStyle;
                }
            }
            slide._mcpresInPlace = false;
            if (inPlaceEl === el) inPlaceEl = null;
            return;
        }

        // Restore externalized PlutoPlotly containers unconditionally (must run
        // even if the slide isn't currently in shadow, to keep cleanup idempotent).
        if (slide.extraPlotContainers && slide.extraPlotContainers.length > 0) {
            for (var p = 0; p < slide.extraPlotContainers.length; p++) {
                var entry = slide.extraPlotContainers[p];
                entry.observer.disconnect();
                entry.container.style.cssText = '';
                if (entry.placeholder.parentNode) {
                    entry.placeholder.parentNode.replaceChild(entry.container, entry.placeholder);
                } else if (entry.container.parentNode) {
                    entry.container.parentNode.removeChild(entry.container);
                }
            }
            slide.extraPlotContainers = [];
        }

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

    function syncPlotGeometry(container, placeholder) {
        var rect = placeholder.getBoundingClientRect();
        container.style.top = rect.top + 'px';
        container.style.left = rect.left + 'px';
        container.style.width = rect.width + 'px';
        container.style.height = rect.height + 'px';
    }

    function handleWindowResize() {
        if (!isSlideMode || slides.length === 0) return;
        var slide = slides[currentSlide];
        if (!slide || !slide.extraPlotContainers) return;
        for (var p = 0; p < slide.extraPlotContainers.length; p++) {
            var entry = slide.extraPlotContainers[p];
            syncPlotGeometry(entry.container, entry.placeholder);
        }
    }

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

        // Externalize PlutoPlotly containers BEFORE the slide enters shadow DOM:
        // D3's event delegation cannot operate across a shadow boundary, so the
        // containers stay in light DOM (in plotLayerEl, position:fixed) with
        // placeholders left behind in the slide to track geometry.
        slide.extraPlotContainers = [];
        var plotContainers = slide.element.querySelectorAll('.plutoplotly-container');
        for (var p = 0; p < plotContainers.length; p++) {
            (function(container) {
                var placeholder = document.createElement('div');
                placeholder.setAttribute('data-mcpres-plotly-placeholder', 'true');
                container.parentNode.replaceChild(placeholder, container);
                plotLayerEl.appendChild(container);
                container.style.cssText =
                    'position:fixed !important;' +
                    'z-index:100000 !important;' +
                    'margin:0 !important;';
                var observer = new ResizeObserver(function() {
                    syncPlotGeometry(container, placeholder);
                });
                slide.extraPlotContainers.push({
                    container: container,
                    placeholder: placeholder,
                    observer: observer
                });
            })(plotContainers[p]);
        }

        // Live WGLMakie/Bonito figures CANNOT leave their Pluto output wrapper:
        // moving the figure DOM (even moving the whole slide into the shadow) makes
        // Pluto continuously re-render the figure, which detaches/disposes it and
        // triggers an endless re-show loop. So a slide that contains a Makie figure
        // is shown IN PLACE — its element stays in its Pluto cell (light DOM, where
        // the canvas renders and the slider is interactive) and is styled as a
        // fullscreen slide on top of the white viewport overlay. All other slides
        // move into the shadow overlay as before (full CSS isolation).
        var isMakieSlide = !!slide.element.querySelector("canvas, .bonito-fragment");
        if (isMakieSlide) {
            ensureMakieInPlaceCSS();
            slide._mcpresInPlace = true;
            inPlaceEl = slide.element;
            slide._mcpresClearedAncestors = clearContainingBlockAncestors(slide.element);
            slide.element.classList.add("mcpres-makie-fullscreen");
        } else {
            slide._mcpresInPlace = false;
            contentEl.appendChild(slide.element);
        }

        // Now that placeholders are laid out inside shadow, sync plot geometry
        // and start observing each placeholder for size/position changes.
        for (var q = 0; q < slide.extraPlotContainers.length; q++) {
            var entry = slide.extraPlotContainers[q];
            syncPlotGeometry(entry.container, entry.placeholder);
            entry.observer.observe(entry.placeholder);
        }

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

    // --- Print Mode ---

    function degradeInteractiveElements(container) {
        // Replace interactive inputs with static text showing their current value
        var inputs = container.querySelectorAll("input, select, textarea");
        for (var i = 0; i < inputs.length; i++) {
            var el = inputs[i];
            var value = "";
            if (el.tagName === "SELECT") {
                var opt = el.options[el.selectedIndex];
                value = opt ? opt.textContent : el.value;
            } else if (el.type === "range") {
                value = el.value;
            } else if (el.type === "checkbox") {
                value = el.checked ? "\u2611" : "\u2610";
            } else {
                value = el.value;
            }
            var span = document.createElement("span");
            span.className = "mcpres-print-static-value";
            span.textContent = value;
            el.parentNode.replaceChild(span, el);
        }
        // Disable buttons (leave visible but clearly non-functional)
        var buttons = container.querySelectorAll("button");
        for (var b = 0; b < buttons.length; b++) {
            buttons[b].disabled = true;
            buttons[b].style.opacity = "0.5";
            buttons[b].style.cursor = "default";
        }
    }

    function triggerKaTeXOnPrintLayout() {
        if (typeof renderMathInElement === "undefined") return;
        var printSlides = document.querySelectorAll("#mcpres-print-layout [data-mcpres-slide]");
        for (var i = 0; i < printSlides.length; i++) {
            renderMathInElement(printSlides[i], {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "$", right: "$", display: false}
                ],
                throwOnError: false
            });
        }
    }

    function enterPrintMode() {
        // Exit slide mode first — returns all slides to Pluto DOM
        exitSlideMode();

        isPrintMode = true;

        // Inject @page rule into <head> — must be in <head> for Chrome to honour it.
        // margin: 0 suppresses Chrome's built-in date/URL header/footer strip.
        // Page is 297mm wide (A4 landscape width); height follows the notebook's
        // configured aspect ratio (data-page-h, set by slide_setup) so the export
        // matches the on-screen slide box — falls back to the 16:9 default.
        var pageConfig = document.getElementById("mcpres-config");
        var pageHeightMm = (pageConfig && pageConfig.dataset.pageH) ? pageConfig.dataset.pageH : "167.06";
        var pageStyle = document.createElement("style");
        pageStyle.id = "mcpres-page-rule";
        pageStyle.textContent = "@page { size: 297mm " + pageHeightMm + "mm; margin: 0; }";
        document.head.appendChild(pageStyle);

        // Re-gather slides (exitSlideMode cleared state)
        gatherSlides();

        // Create print layout container
        var layout = document.createElement("div");
        layout.id = "mcpres-print-layout";
        document.body.appendChild(layout);

        // "Back to slides" button
        var backBtn = document.createElement("button");
        backBtn.id = "mcpres-print-back";
        backBtn.textContent = "\u25C0 Back to slides";
        backBtn.addEventListener("click", function() { exitPrintMode(true); });
        layout.appendChild(backBtn);

        // Read config for footer
        var config = document.getElementById("mcpres-config");
        var author = "", place = "", date = "";
        if (config) {
            author = config.dataset.author || "";
            place = config.dataset.place || "";
            date = config.dataset.date || "";
        }
        var footerText = [author, place, date].filter(function(s) { return s; }).join(", ");

        // Clone our mcpres CSS into main DOM style block for print pages
        var printStyle = document.createElement("style");
        printStyle.id = "mcpres-print-styles-clone";
        var docStyles = document.querySelectorAll("style");
        for (var m = 0; m < docStyles.length; m++) {
            if (docStyles[m].textContent.indexOf("--mcpres-colour") !== -1) {
                printStyle.textContent = docStyles[m].textContent;
                break;
            }
        }
        layout.appendChild(printStyle);

        // Render each slide as a print page
        for (var i = 0; i < slides.length; i++) {
            var slide = slides[i];

            // Clone the slide element (keep originals in Pluto DOM)
            var clone = slide.element.cloneNode(true);

            // Reveal all fragments and overlays
            applyFragments(clone, 9999);
            applyOverlays(clone, 9999);

            // Create page wrapper
            var page = document.createElement("div");
            page.className = "mcpres-print-page";
            page.appendChild(clone);

            // Degrade interactive elements in clone (inputs, selects, buttons from Pluto bonds)
            degradeInteractiveElements(clone);

            // Include slide_part extra cells in the print page
            for (var j = 0; j < slide.extraCells.length; j++) {
                var extraClone = slide.extraCells[j].cloneNode(true);
                extraClone.style.cssText = "";
                extraClone.className = (extraClone.className || "") + " mcpres-print-extra-cell";
                page.appendChild(extraClone);
            }

            // Footer
            if (slide.type !== "blank") {
                var footer = document.createElement("div");
                footer.className = "mcpres-print-footer";

                var footerLeft = document.createElement("div");
                footerLeft.className = "mcpres-print-footer-left";
                footerLeft.textContent = footerText;

                var footerRight = document.createElement("div");
                footerRight.className = "mcpres-print-footer-right";
                if ((slide.type === "double" || slide.type === "static-double") && slide.pageNum2 !== null) {
                    footerRight.textContent = slide.pageNum + " - " + slide.pageNum2;
                } else {
                    footerRight.textContent = String(slide.pageNum);
                }

                footer.appendChild(footerLeft);
                footer.appendChild(footerRight);
                page.appendChild(footer);
            }

            layout.appendChild(page);
        }

        // Apply page breaks inline — only on non-last pages to avoid trailing blank page
        var pages = layout.querySelectorAll(".mcpres-print-page");
        for (var p = 0; p < pages.length - 1; p++) {
            pages[p].style.breakAfter = "page";
            pages[p].style.pageBreakAfter = "always";
        }
        if (pages.length > 0) {
            pages[pages.length - 1].style.breakAfter = "auto";
            pages[pages.length - 1].style.pageBreakAfter = "auto";
        }

        // Trigger KaTeX re-render on cloned slides
        triggerKaTeXOnPrintLayout();

        // Hide Pluto notebook content
        var notebook = document.querySelector("pluto-notebook");
        if (notebook) notebook.style.display = "none";

        // Listen for keyboard (Escape to exit)
        document.addEventListener("keydown", handlePrintKey);

        // Scroll to top
        window.scrollTo(0, 0);
    }

    function exitPrintMode(reenterSlides) {
        isPrintMode = false;

        // Remove @page rule injected into <head>
        var pageStyle = document.getElementById("mcpres-page-rule");
        if (pageStyle && pageStyle.parentNode) pageStyle.parentNode.removeChild(pageStyle);

        // Remove print layout
        var layout = document.getElementById("mcpres-print-layout");
        if (layout && layout.parentNode) layout.parentNode.removeChild(layout);

        // Restore Pluto notebook visibility
        var notebook = document.querySelector("pluto-notebook");
        if (notebook) notebook.style.display = "";

        document.removeEventListener("keydown", handlePrintKey);

        if (reenterSlides) {
            enterSlideMode();
        }
    }

    function handlePrintKey(e) {
        if (e.key === "Escape") {
            e.preventDefault();
            exitPrintMode(true);
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
            case "p":
            case "P":
                e.preventDefault();
                enterPrintMode();
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
                if (plotLayerEl && plotLayerEl.contains(m.target)) continue;
                // Ignore mutations inside an in-place Makie figure slide (the live
                // figure and KaTeX re-renders mutate it constantly; reacting would
                // re-show it endlessly).
                if (inPlaceEl && inPlaceEl.contains(m.target)) continue;
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

    // Global API for external tools (Playwright, DevTools)
    window.__mcpres = {
        enterSlideMode: enterSlideMode,
        exitSlideMode: exitSlideMode,
        enterPrintMode: enterPrintMode,
        exitPrintMode: exitPrintMode,
        getSlideCount: function() { return slides.length; }
    };

})();
