### A Pluto.jl notebook ###
# v0.20.16

using Markdown
using InteractiveUtils

# This Pluto notebook uses @bind for interactivity. When running this notebook outside of Pluto, the following 'mock version' of @bind gives bound variables a default value (instead of an error).
macro bind(def, element)
    #! format: off
    return quote
        local iv = try Base.loaded_modules[Base.PkgId(Base.UUID("6e696c72-6542-2067-7265-42206c756150"), "AbstractPlutoDingetjes")].Bonds.initial_value catch; b -> missing; end
        local el = $(esc(element))
        global $(esc(def)) = Core.applicable(Base.get, el) ? Base.get(el) : iv(el)
        el
    end
    #! format: on
end

# ╔═╡ 00000001-0000-0000-0000-000000000001
begin
	import Pkg
	Pkg.develop(path=joinpath(@__DIR__))
	Pkg.add(["PlutoUI", "Plots"])
	using MCPresPluto, PlutoUI, Plots
	nothing
end

# ╔═╡ 00000001-0000-0000-0000-000000000002
slide_setup(
	author = "Adrien Florio",
	place = "Bielefeld",
	date = "01.07.25",
	colour = :bleunuit
)

# ╔═╡ 00000001-0000-0000-0000-000000000003
blank_slide(md"""
## A very long title for a very short introduction to tensor networks and quantum computations

*Adrien Florio*

CRC-TR 211 Retreat 26 YS lecture
""")

# ╔═╡ 00000001-0000-0000-0000-000000000004
slide("My trajectory", md"""
**MSc in 2016** — EPFL

**PhD in 2020** — EPFL

**Postdoc 1** — 2020–2022, Stony Brook, nuclear theory

**Postdoc 2** — 2022–2025, Brookhaven National Lab, nuclear theory + C2QA
""")

# ╔═╡ 00000001-0000-0000-0000-000000000005
double_slide("Motivations", "Free fermion 1D",
	md"""
**Problem: exponentially large!**

$$|\psi\rangle = e^{iHt} |\psi_0\rangle$$
	""",
	md"""
**Creation, annihilation operators** ``c_n, c_n^\dagger``

**Fock space** ``\{|0\rangle, |1\rangle\}_1 \otimes \cdots \otimes \{|0\rangle, |1\rangle\}_f``

$$|\psi\rangle = \sum_{i_1, i_2, \ldots, i_n} c_{i_1 i_2 \cdots i_n} |i_1 i_2 \cdots i_n\rangle$$

**Dim.** ``2 \times 2 \times \cdots \times 2 = 2^n``
	"""
)

# ╔═╡ 00000001-0000-0000-0000-000000000006
double_slide("Ways out", "TN 101: SVD",
	md"""
$$|\psi\rangle = \sum_{i_1, i_2, \ldots, i_n} c_{i_1 i_2 \cdots i_n} |i_1 i_2 \cdots i_n\rangle$$

**Compress** → **Tensor networks (TN)**

**Physically realize** → **Quantum simulations (QS)**
	""",
	let
		top = md"""
**"Polar representation of matrices"**

``M \in \text{GL}(m, n)`` can always be decomposed as

$$M = U \cdot \Sigma \cdot V^\dagger$$
		"""
		bottom = overlay(md"**Optimal truncation of rank** ``r'``: keep ``r'`` singular values", 1)
		@htl("""$(top)$(bottom)""")
	end
)

# ╔═╡ 00000001-0000-0000-0000-000000000008
static_double_slide("Ways out", "TN 102: reshaping",
	md"""
$$|\psi\rangle = \sum_{i_1, i_2, \ldots, i_n} c_{i_1 i_2 \cdots i_n} |i_1 i_2 \cdots i_n\rangle$$

**Compress** → **Tensor networks (TN)**

**Physically realize** → **Quantum simulations (QS)**
	""",
	md"""
Rewrite as matrix:

$$|\psi\rangle = \sum_{I, J} c_{IJ} |I, J\rangle$$

``I \in [1, 2^a], \quad J \in [1, 2^b], \quad a + b = n``
	"""
)

# ╔═╡ 00000001-0000-0000-0000-000000000009
slide_part(@bind xmax Slider(1:0.5:10, default=5, show_value=true))

# ╔═╡ 00000001-0000-0000-0000-00000000000a
slide("Interactive plot demo", let
	x = range(0, xmax, length=200)
	p = plot(x, x, label="y = x", xlabel="x", ylabel="y",
		xlim=(0, 10), ylim=(0, 10),
		linewidth=2, legend=:topleft, size=(600, 400))
	@htl("""$(p)""")
end)

# ╔═╡ 00000001-0000-0000-0000-000000000007
slide_button()

# ╔═╡ Cell order:
# ╟─00000001-0000-0000-0000-000000000001
# ╟─00000001-0000-0000-0000-000000000002
# ╟─00000001-0000-0000-0000-000000000003
# ╟─00000001-0000-0000-0000-000000000004
# ╟─00000001-0000-0000-0000-000000000005
# ╟─00000001-0000-0000-0000-000000000006
# ╟─00000001-0000-0000-0000-000000000008
# ╟─00000001-0000-0000-0000-00000000000a
# ╠═00000001-0000-0000-0000-000000000009
# ╟─00000001-0000-0000-0000-000000000007
