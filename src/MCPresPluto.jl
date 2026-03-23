module MCPresPluto

using HypertextLiteral
using PlutoUI
using AbstractPlutoDingetjes

include("colors.jl")
include("fragments.jl")
include("setup.jl")
include("slides.jl")

using HypertextLiteral: @htl
export slide_setup, slide, double_slide, static_double_slide, blank_slide, slide_button, slide_part, pause, overlay, @htl

end # module
