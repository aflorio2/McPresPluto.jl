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

    # Use HTML() to inject raw CSS/JS without escaping
    HTML("""
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cabin:ital,wght@0,400;0,700;1,400;1,700&display=swap">
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
    """)
end
