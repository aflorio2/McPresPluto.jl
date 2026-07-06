# Slide setup — injects CSS, JS, and configuration into the Pluto notebook

# Named aspect ratios (width / height). :widescreen is the default — pass
# :standard for legacy 4:3 (beamer) decks, or any Real for a custom ratio.
const ASPECT_RATIOS = Dict(:widescreen => 16 / 9, :standard => 4 / 3)

function _resolve_aspect(aspect::Union{Symbol,Real})
    aspect isa Real && return Float64(aspect)
    haskey(ASPECT_RATIOS, aspect) && return ASPECT_RATIOS[aspect]
    error("Unknown aspect ratio :$aspect — use :widescreen, :standard, or a numeric width/height ratio")
end

"""
    slide_setup(; author, place, date, colour=:bleunuit, font_size=9, line_opacity=0.9,
                page_opacity=0.45, aspect=:widescreen)

Initialize MCPresPluto slide mode. Call this in the first cell of your notebook.
Injects all CSS and JS needed for the slide engine.

`aspect` sets the slide box's width/height ratio, on screen and in exported PDFs:
`:widescreen` (16:9, default), `:standard` (4:3, matches the original beamer decks),
or any `Real` ratio (e.g. `1.5`).
"""
function slide_setup(; author::String="", place::String="", date::String="",
                      colour::Symbol=:bleunuit, font_size::Int=9,
                      line_opacity::Float64=0.9, page_opacity::Float64=0.45,
                      aspect::Union{Symbol,Real}=:widescreen)

    colour_css = color_to_css(colour)
    aspect_ratio = _resolve_aspect(aspect)
    # PDF page width is fixed at A4-landscape's 297mm; height follows the aspect
    # ratio so exported PDFs match the on-screen slide box (no stretch/letterbox).
    page_height_mm = round(297.0 / aspect_ratio, digits=2)

    css_path = joinpath(@__DIR__, "assets", "mcpres.css")
    js_path = joinpath(@__DIR__, "assets", "mcpres.js")
    css_content = read(css_path, String)
    js_content = read(js_path, String)

    # Per-color CSS variables (--mcpres-<name>) so title color spans can resolve
    # named colors via var(--mcpres-<name>); single source of truth is COLORS.
    color_vars = join(["        --mcpres-$(name): $(color_to_css(name));" for name in keys(COLORS)], "\n")

    # Build the full CSS with variables prepended
    css_vars = """
    :root {
        --mcpres-colour: $(colour_css);
        --mcpres-line-opacity: $(line_opacity);
        --mcpres-page-opacity: $(page_opacity);
        --mcpres-font-size: $(font_size)pt;
        --mcpres-aspect: $(aspect_ratio);
        --mcpres-page-h: $(page_height_mm)mm;
$(color_vars)
    }
    """

    # Overrides the static file's fallback @page rule — CSS custom properties
    # aren't honored inside @page {size}, so the literal mm value is baked in here.
    page_css = """
    @page {
        size: 297mm $(page_height_mm)mm;
        margin: 0;
    }
    """
    full_css = css_vars * "\n" * css_content * "\n" * page_css

    # KaTeX auto-render: dynamically load KaTeX and poll for mcpres slides to render
    katex_script = """
    (function() {
        function loadScript(src, cb) {
            var s = document.createElement("script");
            s.src = src;
            s.onload = cb;
            document.head.appendChild(s);
        }

        function startRendering() {
            setInterval(function() {
                if (typeof renderMathInElement === "undefined") return;
                document.querySelectorAll("[data-mcpres-slide]").forEach(function(el) {
                    var v = el.innerHTML.length;
                    if (el._katexV !== v) {
                        renderMathInElement(el, {
                            delimiters: [
                                {left: "\$\$", right: "\$\$", display: true},
                                {left: "\$", right: "\$", display: false}
                            ],
                            throwOnError: false
                        });
                        el._katexV = v;
                    }
                });
            }, 500);
        }

        loadScript("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js", function() {
            loadScript("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js", startRendering);
        });
    })();
    """

    # Use HTML() to inject raw CSS/JS without escaping
    HTML("""
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cabin:ital,wght@0,400;0,700;1,400;1,700&display=swap">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
    <style>
    $(full_css)
    </style>
    <div id="mcpres-config" style="display:none;"
         data-author="$(author)"
         data-place="$(place)"
         data-date="$(date)"
         data-aspect="$(aspect_ratio)"
         data-page-h="$(page_height_mm)">
    </div>
    <script>
    $(js_content)
    </script>
    <script>
    $(katex_script)
    </script>
    """)
end
