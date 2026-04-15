# MCPresPluto.jl

A Pluto.jl-based slide presentation engine using Shadow DOM for slide isolation and interactive support.

## Usage

In a Pluto notebook, use the slide DSL:

```julia
using MCPresPluto

slide_setup()  # Call once at the top to initialize styles

slide("My Title", "Subtitle")

double_slide("Left content", "Right content")

slide("Slide with bullets") do
    slide_part("First point")
    slide_part("Second point")
end
```

## PDF Export

### One-time setup

Install Node.js (https://nodejs.org/) then install Playwright:

```bash
npm install -g playwright
npx playwright install chromium
```

### Exporting slides

When Pluto starts it prints a URL like:
```
Go to http://localhost:1234/?secret=XXXX to start writing ~ have fun!
```

Copy the secret token and the notebook URL from your browser, then call from a **separate Julia REPL** (not from within the notebook):

```julia
MCPresPluto.export_pdf(
    "http://localhost:1234/edit?id=<notebook-id>";
    secret = "XXXX",
    output = "slides.pdf"
)
```

- `url`: Notebook URL from your browser's address bar
- `secret`: Secret token from Pluto's terminal output
- `output`: Path for the output PDF file (default: `"slides.pdf"`)

> **Note**: Run `export_pdf` from a separate Julia session, not from within the notebook itself.

> **Note**: The Pluto notebook must be running while the export command executes. The exporter drives a headless Chromium browser to capture each slide as a PDF page.
