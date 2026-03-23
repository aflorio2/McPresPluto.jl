# MCPres color palette — matching couleurs.sty

const COLORS = Dict{Symbol, Tuple{Int,Int,Int}}(
    :abricot => (230, 126, 48),
    :anthracite => (48, 48, 48),
    :amarante => (145, 40, 59),
    :amethyste => (136, 77, 167),
    :blanccreme => (253, 241, 184),
    :ble => (232, 214, 48),
    :bleuciel => (119, 181, 254),
    :bleulavande => (150, 131, 236),
    :bleuroi => (49, 140, 231),
    :bleunuit => (15, 5, 107),
    :boutondor => (252, 220, 18),
    :byzantin => (189, 51, 164),
    :caeruleum => (53, 122, 183),
    :capucine => (255, 94, 77),
    :carotte => (244, 102, 27),
    :chartreuse => (127, 255, 0),
    :cerise => (222, 49, 99),
    :citron => (247, 255, 60),
    :coquelicot => (198, 8, 0),
    :cinabre => (219, 23, 2),
    :emeraude => (1, 215, 88),
    :jaunenaples => (255, 240, 188),
    :neige => (254, 254, 254),
    :noir => (0, 0, 0),
    :sinople => (20, 148, 20),
    :vertherbe => (58, 157, 35),
    :vertpomme => (52, 201, 36),
    :vertprairie => (87, 213, 59),
    :zizolin => (108, 2, 119),
    :grisclair => (220, 220, 220),
    :amazon => (59, 122, 87),
    :bleuimperialfonce => (0, 65, 106),
    :bleucobalt => (0, 71, 171),
    :rougepommedamour => (255, 8, 0),
    :rougecardinal => (196, 30, 58),
    :rougecarmin => (255, 0, 56),
    :fuschiaantique => (145, 92, 131),
    :violeteminence => (108, 48, 130),
    :raisin => (112, 46, 168),
    :black => (0, 0, 0),
)

function color_to_css(sym::Symbol)
    r, g, b = COLORS[sym]
    "rgb($r, $g, $b)"
end
