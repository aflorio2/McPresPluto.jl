# Fragment/overlay system for progressive reveal

"""
    pause()

Insert a pause marker. In slide mode, content after this marker
is hidden until the presenter advances (arrow right).
Mimics Beamer's \\pause command.
"""
function pause()
    @htl("<span class='mcpres-pause' style='display:none;'></span>")
end

"""
    pause(n::Int)

Insert a numbered pause marker. Content after this marker is
revealed when fragment index reaches `n`.
"""
function pause(n::Int)
    @htl("<span class='mcpres-pause' data-fragment='$(n)' style='display:none;'></span>")
end

"""
    overlay(content, from::Int)

Wrap content that only appears from fragment `from` onwards.
"""
function overlay(content, from::Int)
    @htl("""<div class="mcpres-overlay" data-mcpres-from="$(from)">$(content)</div>""")
end

"""
    overlay(content, from::Int, to::Int)

Wrap content that appears from fragment `from` to fragment `to` (inclusive).
"""
function overlay(content, from::Int, to::Int)
    @htl("""<div class="mcpres-overlay" data-mcpres-from="$(from)" data-mcpres-to="$(to)">$(content)</div>""")
end
