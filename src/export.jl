"""
    export_pdf(url; secret=nothing, output="slides.pdf")

Export MCPresPluto slides to PDF by driving a headless Chromium browser via Playwright.

Requires Node.js and the `playwright` npm package:
    npm install -g playwright
    npx playwright install chromium

Works by fetching Pluto's static HTML export (no WebSocket or live session needed),
then rendering it in a headless browser.

# Arguments
- `url`: URL of the running Pluto notebook (e.g. `"http://localhost:1234/edit?id=<notebook-id>"`)
- `secret`: Pluto server secret. Find it in the terminal output when Pluto starts:
  `"Go to http://localhost:1234/?secret=XXXX to start writing"`.
  Not needed if Pluto was started with `require_secret_for_access=false`.
- `output`: Path for the output PDF file (default: `"slides.pdf"`)

# Example
    MCPresPluto.export_pdf("http://localhost:1234/edit?id=abc"; secret="XXXX", output="my_slides.pdf")
"""
function export_pdf(url::String; secret::Union{String,Nothing}=nothing, output::String="slides.pdf")
    # Check node is available
    node_path = Sys.which("node")
    if isnothing(node_path)
        error("node not found in PATH. Install Node.js from https://nodejs.org/")
    end

    # Check playwright is importable (run from package root so node_modules is found)
    pkg_dir = dirname(@__DIR__)
    check = run(ignorestatus(Cmd(`$(node_path) -e "require('playwright')"`, dir=pkg_dir)))
    if check.exitcode != 0
        error("""
playwright not found. Install it with:
    npm install -g playwright
    npx playwright install chromium
        """)
    end

    # Extract notebook id and base URL from the edit URL
    m_id   = match(r"[?&]id=([^&]+)", url)
    m_base = match(r"^(https?://[^/]+)", url)
    if isnothing(m_id) || isnothing(m_base)
        error("Could not parse notebook URL: $url\nExpected format: http://localhost:PORT/edit?id=NOTEBOOK_ID")
    end
    notebook_id = m_id.captures[1]
    base_url    = m_base.captures[1]

    # Build the static HTML export URL — no WebSocket needed, no session disruption
    export_url = "$base_url/notebookexport?id=$notebook_id"
    if !isnothing(secret)
        export_url *= "&secret=" * secret
    end

    script = joinpath(@__DIR__, "assets", "export_pdf.mjs")
    output_abs = abspath(output)

    # Pass the export URL to node; node fetches the HTML and renders it locally
    cmd = `$(node_path) $(script) $(export_url) $(output_abs)`
    result = run(cmd)
    if result.exitcode != 0
        error("PDF export failed (exit code $(result.exitcode)).")
    end
    return output_abs
end
