# Slide setup — injects CSS, JS, and configuration into the Pluto notebook

"""
    slide_setup(; author, place, date, colour=:bleunuit, font_size=9, line_opacity=0.9, page_opacity=0.45)

Initialize MCPresPluto slide mode. Call this in the first cell of your notebook.
Injects all CSS and JS needed for the slide engine.
"""
function slide_setup(; author::String="", place::String="", date::String="",
                      colour::Symbol=:bleunuit, font_size::Int=9,
                      line_opacity::Float64=0.9, page_opacity::Float64=0.45)

    colour_css = color_to_css(colour)

    css_path = joinpath(@__DIR__, "assets", "mcpres.css")
    js_path = joinpath(@__DIR__, "assets", "mcpres.js")
    css_content = read(css_path, String)
    js_content = read(js_path, String)

    # Build the full CSS with variables prepended
    css_vars = """
    :root {
        --mcpres-colour: $(colour_css);
        --mcpres-line-opacity: $(line_opacity);
        --mcpres-page-opacity: $(page_opacity);
        --mcpres-font-size: $(font_size)pt;
    }
    """
    full_css = css_vars * "\n" * css_content

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
         data-date="$(date)">
    </div>
    <script>
    $(js_content)
    </script>
    <script>
    $(katex_script)
    </script>
    """)
end
