# Slide layout functions — each returns an @htl blob with data-mcpres-slide markers

"""
    slide(title, content)

Single full-width slide. Matches MCPres `\\singleframe`.
"""
function slide(title::AbstractString, content)
    t = isempty(title) ? "\$\\phantom{\\text{A}}\$" : title
    @htl("""
    <div class="mcpres-slide" data-mcpres-slide="single">
        <div class="mcpres-title-bar">$(t)</div>
        <div class="mcpres-content-single">
            $(content)
        </div>
    </div>
    """)
end

function slide(f::Function, title::AbstractString)
    slide(title, f())
end

"""
    double_slide(left_title, right_title, left_content, right_content)

Side-by-side double slide. Matches MCPres `\\doubleframe`.
"""
function double_slide(left_title::AbstractString, right_title::AbstractString,
                      left_content, right_content)
    lt = isempty(left_title) && isempty(right_title) ? "\$\\phantom{\\text{A}}\$" : left_title
    @htl("""
    <div class="mcpres-slide" data-mcpres-slide="double">
        <div class="mcpres-double-titles">
            <div class="mcpres-title-left">$(lt)</div>
            <div class="mcpres-title-spacer"></div>
            <div class="mcpres-title-right">$(right_title)</div>
        </div>
        <div class="mcpres-double-panels">
            <div class="mcpres-panel-left">
                $(left_content)
            </div>
            <div class="mcpres-divider"></div>
            <div class="mcpres-panel-right">
                $(right_content)
            </div>
        </div>
    </div>
    """)
end

function double_slide(f::Function, left_title::AbstractString, right_title::AbstractString)
    left_content, right_content = f()
    double_slide(left_title, right_title, left_content, right_content)
end

"""
    static_double_slide(left_title, right_title, left_content, right_content)

Static double slide: left panel frozen, right builds. Matches MCPres `=left - right`.
"""
function static_double_slide(left_title::AbstractString, right_title::AbstractString,
                             left_content, right_content)
    lt = isempty(left_title) && isempty(right_title) ? "\$\\phantom{\\text{A}}\$" : left_title
    @htl("""
    <div class="mcpres-slide" data-mcpres-slide="static-double">
        <div class="mcpres-double-titles">
            <div class="mcpres-title-left">$(lt)</div>
            <div class="mcpres-title-spacer"></div>
            <div class="mcpres-title-right">$(right_title)</div>
        </div>
        <div class="mcpres-double-panels">
            <div class="mcpres-panel-left">
                $(left_content)
            </div>
            <div class="mcpres-divider"></div>
            <div class="mcpres-panel-right">
                $(right_content)
            </div>
        </div>
    </div>
    """)
end

function static_double_slide(f::Function, left_title::AbstractString, right_title::AbstractString)
    left_content, right_content = f()
    static_double_slide(left_title, right_title, left_content, right_content)
end

"""
    blank_slide(content)

Blank frame — centered content, no chrome. Matches MCPres `\\blankframe`.
"""
function blank_slide(content)
    @htl("""
    <div class="mcpres-slide" data-mcpres-slide="blank">
        <div class="mcpres-content-blank">
            $(content)
        </div>
    </div>
    """)
end

function blank_slide(f::Function)
    blank_slide(f())
end

"""
    slide_part(content)

Marks a cell as belonging to the previous slide. Use for `@bind` cells
that should be visible on the same slide as the content that uses them.

# Example
```julia
slide("My plot", let
    plot(range(0, xmax, 200), sin)
end)
```
```julia
slide_part(@bind xmax Slider(1:10, default=5))
```
"""
function slide_part(content)
    @htl("""<div data-mcpres-slide-part="true">$(content)</div>""")
end

"""
    slide_button()

Toggle button for slide mode. Press Escape to exit.
"""
function slide_button()
    @htl("""
    <div class="mcpres-button-container">
        <label class="mcpres-toggle-label">
            <input type="checkbox" id="mcpres-toggle-input" class="mcpres-toggle-checkbox">
            <span class="mcpres-toggle-text">Slide Mode</span>
        </label>
    </div>
    """)
end
