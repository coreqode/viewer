# Viewer

A minimal, browser-based viewer for meshes, point clouds, CAD geometry, and ONNX coordinate fields. Open local files, inspect geometry, and convert between supported formats. The viewer opens with a generated torus knot in Edges view, ready to inspect or convert. No pretrained weights or checkpoints are bundled.

The application is static HTML, CSS, and JavaScript. It needs no application server, account, npm installation, or build step. Files are processed on your device; some readers download their runtime packages on first use.

## Contents

- [Run locally](#run-locally)
- [Deploy to GitHub Pages](#deploy-to-github-pages)
- [Open files and navigate](#open-files-and-navigate)
- [Supported formats](#supported-formats)
- [Convert geometry](#convert-geometry)
- [Geometry and topology](#geometry-and-topology)
- [ONNX scalar fields](#onnx-scalar-fields)
- [Memory and resource cleanup](#memory-and-resource-cleanup)
- [Limits and troubleshooting](#limits-and-troubleshooting)
- [Project structure](#project-structure)
- [Dependencies and licenses](#dependencies-and-licenses)

## Run locally

Install Python 3, extract the download or clone your copy of this repository, and open a terminal in its root directory:

```sh
python3 serve.py
```

On Windows with the Python launcher:

```powershell
py serve.py
```

Open **http://localhost:8000**. The launcher serves `dist/` on the local machine and uses only Python's standard library. Stop it with **Ctrl+C**. If port 8000 is occupied:

```sh
python3 serve.py --port 8080
```

Then open http://localhost:8080. Alternatively, serve the contents of `dist/` with another static HTTP server. Opening `index.html` through a `file:` URL does not provide the required module/worker environment.

Node.js is optional. If installed, `npm run check` checks JavaScript syntax and `npm start` launches the Python server. Neither command requires `npm install`.

### Browser and network requirements

- Mesh viewing requires WebGL. ONNX field rendering additionally requires WebGPU in an enabled, compatible browser over HTTPS or localhost.
- Three.js loaders/exporters, CAD import, ONNX Runtime JS/WASM, and the Trimesh wheel are bundled.
- Engineering import/conversion downloads Pyodide, NumPy, meshio, and any format-specific packages on first use. Geometry analysis downloads Pyodide, NumPy, SciPy, and its package installer on first use. Keep an internet connection available for these paths.
- Model and companion-file bytes are processed locally. The viewer fetches application assets and reader dependencies; it does not send selected models to a conversion or analysis server.
- An unavailable reader package does not prevent bundled model loaders from working. ONNX inference can fall back to WASM, but its field display still requires WebGPU.

## Deploy to GitHub Pages

The publishable website is **the contents of `dist/`**. Keep `index.html`, all application modules, `vendor/`, the runtime `.bin` parts, and `README.md` together. Asset URLs are relative, so the viewer can also live beneath a project path or an existing site's subfolder.

Two deployment options:

1. **GitHub Actions:** configure Pages to use GitHub Actions and upload `dist/` as the static site artifact in your Pages workflow.
2. **Branch publishing:** copy the contents of `dist/` into the root of a dedicated publishing branch, or into `/docs` on your chosen branch. In **Settings → Pages**, choose **Deploy from a branch** and select that branch and directory. GitHub's branch publishing supports the branch root or `/docs`; it does not directly select `/dist`.

A `.nojekyll` marker is included in `dist/` for static branch publishing. Preserve it when copying files. To add Viewer to an existing Pages website, place the same contents in a subfolder of that site's published directory.

Source: [GitHub's publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

The root `README.md` is the documentation source. A matching copy is served as `dist/README.md` for the Info panel's documentation link; keep both copies in sync after documentation edits.

## Open files and navigate

Use **Open file** or drag files onto the canvas. Select the main model and companion files together. **Formats → Open a folder** preserves subdirectories for models that reference other files. When multiple supported models are selected, choose which one to display.

| Action | Control |
| --- | --- |
| Orbit | Drag |
| Zoom | Scroll |
| Pan | Right-drag |
| Fit the loaded object | Fit button or **F** |
| Toggle the ground grid | Grid button or **G** |
| Change mesh display | **Normal**, **Solid**, **Edges** (default), or **Wire** |
| Inspect the mesh | **Info** |
| Export another format | **Convert** |
| Configure an ONNX field | **Field** |

The corner orientation indicator shows fixed world axes: **red X**, **green Y**, and **blue Z**. Dimmed ends show negative directions. It follows camera rotation in mesh and ONNX views and lets pointer gestures pass through it. It indicates direction; it does not transform objects or snap the camera.

**Normal** visualizes surface-normal directions as RGB colors in view space, using the model’s vertex normals (computed when missing). Colors change as you orbit the camera. **Solid** uses neutral flat shading, **Edges** adds triangle edges, and **Wire** shows the triangle wireframe. Original materials, textures, animation playback, solver settings, editable CAD assemblies, and simulation-field visualization are not presented. The viewer centers and scales displayed geometry to fit the viewport; measurements and exports use the captured loader coordinates described below.

## Supported formats

Support is delegated to the listed readers. A recognized extension does not guarantee support for every version, variant, optional extension, or file layout. `dist/formats.js` is the authoritative extension registry.

### Models, surfaces, and point clouds

| Format | Extensions | Notes |
| --- | --- | --- |
| Wavefront OBJ | `.obj` | Geometry only; MTL and textures are ignored. |
| STL | `.stl` | Triangle surfaces. |
| PLY | `.ply` | Polygon meshes or point clouds. |
| glTF / GLB | `.gltf`, `.glb` | Select referenced `.bin` files together with `.gltf`. Draco and Meshopt geometry decoders are configured. Textures and animations are omitted. |
| FBX | `.fbx` | Initial static geometry. |
| COLLADA | `.dae` | Initial static geometry. |
| 3D Studio | `.3ds` | Reader-supported geometry. |
| 3MF | `.3mf` | Core geometry; optional extensions may be unsupported. |
| AMF | `.amf` | Reader-supported geometry. |
| Point clouds | `.pcd`, `.xyz` | Points only; no surface reconstruction. |
| VTK PolyData | `.vtp` | Polygonal surfaces. Legacy `.vtk` PolyData also has a surface-reader path. |

Skinned, instanced, and actively morphed meshes can use **Wire** to show their actual mesh edges. The separate **Edges** overlay is omitted for these meshes. Animations are not advanced; analysis and export capture a static pose.

### Engineering and scientific meshes

| Format | Extensions | Notes |
| --- | --- | --- |
| Gmsh / ANSYS MSH | `.msh` | Gmsh 2.2, 4.0, 4.1 and meshio-supported ANSYS files. |
| OFF | `.off` | Triangular OFF meshes through the selected reader. |
| VTK / VTU | `.vtk`, `.vtu` | Unstructured grids; legacy PolyData uses a surface reader when applicable. |
| Abaqus | `.inp` | Select referenced include files together. |
| Nastran | `.bdf`, `.nas`, `.fem` | Reader-supported decks. |
| Medit | `.mesh`, `.meshb` | Text and binary variants supported by meshio. |
| Netgen | `.vol` | Reader-supported meshes. |
| TetGen | `.node`, `.ele` | Select the matching pair. |
| XDMF | `.xdmf`, `.xmf` | Single grids; select referenced HDF5 files together. Collections and time series are unsupported. |
| CGNS / MED / H5M | `.cgns`, `.med`, `.h5m` | Reader-supported unstructured layouts; loads HDF5 support. |
| Exodus | `.e`, `.exo`, `.ex2` | Loads NetCDF support. |
| SU2 | `.su2` | Reader-supported meshes. |
| UGRID | `.ugrid` | Preserve filenames for binary variants such as `.lb8.ugrid`. |
| Kratos MDPA | `.mdpa` | Reader-supported meshes. |
| AVS-UCD | `.avs` | Reader-supported meshes. |
| DOLFIN XML | `.xml` | DOLFIN mesh XML only. |
| PERMAS | `.post`, `.dato` | Reader-supported meshes. |
| FLAC3D | `.f3grid` | Reader-supported meshes. |
| Tecplot | `.dat` | Meshio-supported Tecplot layouts only. |
| WKT TIN | `.wkt` | Triangulated irregular networks. |

The display adapter handles triangles, quads, tetrahedra, hexahedra, wedges, pyramids, lines, and explicit points. Higher-order elements use corner nodes and straight edges in the view. Unsupported cells are reported as omitted.

**Volume meshes display all cell faces, including internal faces.** The viewer does not extract a volume boundary or perform volume-cell adjacency, Jacobian, inversion, or quality analysis. Original element connectivity remains available to the engineering conversion path where its writer supports it.

### CAD

| Format | Extensions | Notes |
| --- | --- | --- |
| STEP | `.step`, `.stp` | Imported surfaces are tessellated to triangles. |
| IGES | `.iges`, `.igs` | Tessellated surfaces; curve-only files may contain no displayable geometry. |
| Open CASCADE BREP | `.brep`, `.brp` | Tessellated display geometry. |

CAD import uses Open CASCADE through occt-import-js. The viewer does not expose exact BREP faces, edges, solids, or CAD editing. Measurements apply to the tessellation. STEP/IGES importer coordinates use millimeters; BREP units are unspecified.

### Neural coordinate fields

| Format | Extension | Contract |
| --- | --- | --- |
| ONNX coordinate field | `.onnx` | One dynamic float32 `[N,3]` input and one float32 `[N]` or `[N,1]` scalar output. Select referenced external weights together. |

See [ONNX scalar fields](#onnx-scalar-fields) for normalization, sampling, and rendering details.

USD/USDZ, native CAD project files, IFC, LAS/LAZ, arbitrary archives, and arbitrary ONNX input/output interfaces are not currently supported.

## Convert geometry

Open a model and choose **Convert**. Available targets depend on the loaded geometry and source format. Conversion runs locally and downloads a file; it does not overwrite the original.

| Path | Output formats | Data used |
| --- | --- | --- |
| Loaded geometry | OBJ, binary STL, binary PLY, GLB, glTF with embedded buffers | A scene snapshot captured before viewer centering/scaling. |
| Original engineering mesh | VTU, VTK, Gmsh 2.2, Abaqus INP, Nastran BDF | Original files re-read by meshio; preserves original nodes and element connectivity where supported. |

### Export behavior and restrictions

- Exports retain loader coordinate values. No additional unit conversion is performed. In particular, glTF consumers normally interpret values in meters, which may differ from a source file's units.
- Loaded-geometry exports omit original materials, textures, animation clips, and simulation fields. Importers can triangulate polygons or reduce precision; exporting does not reconstruct the original representation.
- Engineering targets are offered only when the pinned writer has mappings for every original cell type. Metadata and field preservation depend on that writer; conversion warnings are shown.
- Geometry exports of volume meshes contain **all displayed cell faces**, including internal faces. They do not preserve volume elements. Use the original engineering path for element connectivity.
- Higher-order geometry exports use straight faces between corner nodes. Elements omitted from the display are also omitted from its geometry export.
- STL contains triangles only; lines and points are omitted.
- PLY is unavailable for line geometry or a mixture of mesh and point-cloud objects. Pure point-cloud PLY export is supported.
- Skinned, instanced, or actively morphed meshes are offered GLB/glTF; other geometry exporters do not faithfully handle all those cases.
- CAD export produces an approximate triangle mesh. STEP, IGES, and BREP output are not implemented.
- ONNX fields cannot be converted to mesh formats in this viewer. No isosurface extraction or neural-model conversion is provided.

Three.js exporters and meshio perform serialization; the application does not implement custom format encoders.

## Geometry and topology

**Info** opens a non-modal panel so the geometry remains interactive. The panel shows a compact summary; **Object details** expands a few per-object results, and **Export JSON** contains the full available report. The panel's documentation link opens this README.

The analysis uses Trimesh, NumPy, and SciPy in an independent worker. Counts and bounds are shown before full analysis finishes and remain available if analysis packages cannot load. Closing the panel or changing the model cancels in-progress analysis. Completed results are cached for the current source and connectivity mode.

### Compact panel

- File name, format, and selected-file size in MiB.
- Object and vertex-record counts; triangle, line-segment, or point counts as applicable.
- XYZ dimensions, coordinate-unit convention, and original engineering node/element counts when available.
- Summed surface area, unique edges, boundary edges, edges shared by more than two faces, connected components, duplicate/degenerate triangles, and edge-closed object count.
- Per-object Euler characteristic, winding consistency, boundary-loop count, and eligible signed volume; line lengths/components or unique/duplicate point counts as applicable.

CAD tessellation, internal volume-cell faces, omitted elements, and partial-analysis results retain short contextual notices in the panel because they affect interpretation.

### Measurement coordinates and units

Measurements use full loaded buffers in the captured static pose, including hidden objects, with object/instance transforms applied **before viewer centering and scaling**. Skin/morph positions are captured in that static pose. Each instance is measured separately. Referenced indices define the bounds; unreferenced position records are still counted.

Position records are buffer entries, not necessarily unique geometric points. Records may repeat at UV/normal seams or across objects. Areas use squared coordinate units; volumes use cubed units. The Info panel does not convert units.

| Source | Reported convention |
| --- | --- |
| STEP / IGES | Millimeters from the CAD importer |
| glTF / GLB | Meters by glTF convention |
| Other formats, including BREP | Source coordinates; unspecified |

### Connectivity modes

**Weld positions** is the default. For each mesh object/instance independently, the analysis normalizes coordinates by the part's bounding-box diagonal and compares positions at eight decimal places. UV and normal seams are ignored. This can join coincident sheets; it is not a proof that the joined surface is physically connected.

**Loaded indices** preserves the connectivity supplied by the loader. Separate objects and instances are never joined in either mode. Surface topology excludes unreferenced vertices. Line components always use loaded indices. Point uniqueness uses exact position equality. The application performs no repair, reorientation, or self-intersection removal.

### Full JSON report

| Report section | Available data |
| --- | --- |
| Status and overview | Schema version, source name/format/files/bytes, connectivity mode, analysis status (`pending`, `ready`, `partial`, or `unavailable`), errors, object/instance and primitive counts. |
| Bounds | Minimum/maximum XYZ, XYZ dimensions, box center, diagonal, and unit convention. |
| Original engineering source | Original node count and coordinate dimension; cell blocks with element type/count/nodes per cell; point/cell/field-array names, shapes, and dtypes; point/cell-set names and counts. Field values are not included. |
| Per-object buffer description | Indexed/non-indexed state, attributes and component counts, position records, referenced/unreferenced indices, primitive counts, and bounds. |
| Surface geometry | Area; triangle-area and angle min/mean/max; area-weighted surface centroid. |
| Surface topology | Vertices after the connectivity mode, merged records, unique edges, edges incident to one/two/more than two faces, vertex-connected components, Euler characteristic, edge watertightness, shared-edge winding consistency, duplicate triangles, and degenerate triangles. |
| Boundary graph | Boundary vertices, connected groups, loop count when the graph is unbranched, and branched-vertex count. |
| Mesh statistics | Edge-length, vertex-valence, and incident-face min/mean/max. |
| Closed-surface integrals | Signed volume, magnitude, volume centroid when nonzero, and Trimesh convexity test, subject to the conditions below. |
| Line objects | Total length, segment-length min/mean/max, zero-length segment count, and index-connected components. |
| Point objects | Exact unique-position and duplicate-position counts. |
| Provenance and limits | Analysis engine, connectivity description, per-part errors, and explicitly unchecked properties. |

No raw vertex arrays are included in the exported report. Summary totals include successful objects; a failed part is recorded with its error. If full analysis fails, the report contains the available overview and error status rather than fabricated measurements.

### How to interpret topology results

- **Boundary edge:** an edge incident to one triangle. **Interior edge:** incident to two. **Non-manifold edge count:** edges incident to more than two triangles. This does not test vertex manifoldness.
- **Components:** vertex-connected components within each analyzed part. The summary sums these counts across parts; it does not join coincident objects.
- **Euler characteristic:** the mesh's `V − E + F` after the selected connectivity treatment. It is not presented as a genus or tunnel count.
- **Boundary loops:** reported only when every boundary vertex has degree two. A branched or open boundary graph has an unavailable loop count. Boundary loops are surface boundaries, not tunnels.
- **Degeneracy:** the triangle-height threshold is `1e-12` after normalizing the part by its diagonal. This detects degenerate/near-zero triangles at that scale; it is not a full element-quality metric.
- **Winding consistency:** consistency across shared edges, not proof of global orientability or an outward orientation.
- **Edge closure:** edges satisfy the mesh's watertightness test. Self-intersections and non-manifold vertices remain possible.

### Volumes and untested properties

Closed-surface integrals are reported only for edge-closed, consistently wound surfaces without reported duplicate/degenerate triangles. Signed volume preserves net orientation; a negative value indicates reversed net orientation. The magnitude is the absolute value of that integral. A volume centroid is omitted for zero signed volume.

These are **not certified solid measurements**. Self-intersections, intersections between objects, vertex manifoldness, an orientability proof, genus, exact CAD topology, and volume-cell adjacency/quality are not evaluated. No union volume is computed across overlapping parts. The convexity result is the Trimesh test, not a certification of solid validity.

For volume grids, the displayed/analysed surface includes internal cell faces; it is not an extracted exterior boundary. For CAD, results describe tessellation. Point-cloud analysis does not reconstruct a surface. ONNX fields use **Field** and do not expose mesh Info.

## ONNX scalar fields

Supply your own `.onnx` model. No model downloads, example launchers, checkpoints, or trained weights are included.

### Model contract

| Item | Requirement |
| --- | --- |
| Inputs | Exactly one tensor input |
| Input type/shape | float32 `[N,3]`, with a dynamic batch dimension `N` |
| Outputs | Exactly one tensor output |
| Output type/shape | float32 `[N]` or `[N,1]`, one scalar per input coordinate |
| Coordinates | The model's expected XYZ coordinate system; normalization is model-specific |
| External data | Select referenced weight files together with the `.onnx` graph, preserving filenames/paths |

The viewer does not infer normalization, latent vectors, extra inputs, or the correct scalar level. Unsupported graphs/operators may fail to initialize. A general ONNX model is not automatically a compatible coordinate field. This feature evaluates existing graphs; it does not train or convert them.

### Load and configure

1. Open the ONNX graph and any external data files together.
2. The viewer starts with a **64³** grid, bounds **`[-1,1]` on each axis**, and level **0**.
3. Use **Field** to change XYZ bounds, scalar level, or grid resolution.
4. Changing only the level reuses the GPU texture. Changing bounds/resolution samples the model again.
5. Switch between **Normal** (surface-normal RGB colors) and **Solid** (shaded surface) without sampling the model again. Normal colors use the sampled field’s gradient, transformed into view space, and change as you orbit. They approximate the sampled surface normals rather than the exact neural-network gradient.
6. Orbit, pan, zoom, and Fit use the same camera controls. Edges, wireframe, grid, Info, and mesh conversion are unavailable for fields.

The field summary reports sampled minimum/maximum values and the inference backend. A notice indicates when the selected level lies outside the sampled range or the level set crosses the box boundary. Use that feedback to adjust the level or bounds.

### Inference and rendering

ONNX Runtime Web evaluates the network in batches of 8,192 coordinates. The WebGPU execution provider is attempted first; WASM is a labeled fallback if that provider cannot initialize the graph. Sessions are released after sampling, and input/output tensors are disposed after each batch, including inference failures.

The output is uploaded to a 3D `r32float` texture. A fullscreen WGSL fragment shader ray marches **the sampled texture**, using manual trilinear interpolation, sign changes, and bisection refinement. The network is not evaluated per fragment. Both scalar sign conventions are accepted; no valid distance bound is assumed.

This is an approximate scalar-field visualizer, not certified sphere tracing or an exact neural-network intersection method. Thin features, tangent contacts, and changes between samples can be missed. Geometry can be clipped by the sampling box. The step budget scales with grid resolution.

### Grid sizes and memory

| Grid | Samples | Float32 CPU grid | GPU texture payload |
| --- | ---: | ---: | ---: |
| 64³ | 262,144 | 1 MiB | 1 MiB |
| 96³ | 884,736 | 3.375 MiB | 3.375 MiB |
| 128³ | 2,097,152 | 8 MiB | 8 MiB |
| 256³ | 16,777,216 | 64 MiB | 64 MiB |
| 512³ | 134,217,728 | 512 MiB | 512 MiB |

These are payload sizes, not total process memory. During upload, CPU and GPU copies coexist, in addition to the runtime, model, inference buffers, staging, and browser overhead. The CPU grid is no longer retained by the view after upload. Doubling resolution along each axis increases the number of samples eightfold.

Uploads use independent backing buffers of at most **16 MiB**, also bounded by the device's `maxBufferSize`. They do not submit a view backed by the full 512 MiB array, and no increased device buffer limit is requested. Unsupported 3D texture dimensions are rejected before sampling. Smaller fields may still exceed available GPU memory on some hardware.

Opening another file cancels sampling between batches. The previous successfully loaded model remains visible until its replacement succeeds, so loading can temporarily require memory for both.

The runtime WASM is stored as `ort-runtime.part1.bin` and `ort-runtime.part2.bin` to satisfy static-host file limits. The loader reassembles them automatically. Preserve both files under `dist/vendor/ort/`.

## Memory and resource cleanup

- A successful replacement removes and disposes the previous mesh's geometry/materials, or destroys the previous field's texture/uniform buffer and unconfigures its canvas.
- SDF views retain metadata after upload, not the CPU sampling volume. Disposed views also drop references to GPU objects, metadata, and canvas resources.
- One device-loss listener is registered per shared WebGPU device. It does not capture individual loaded fields or their selected files.
- Engineering-reader jobs use an isolated Python namespace, cleared on success or failure. Temporary job files are removed. Analysis transfers its working arrays to its worker and clears per-job references afterward.
- Conversion snapshots and old Info reports are released on source changes. Original engineering source files remain available while that source is active so it can be re-read for conversion.
- Selected-file object URLs are revoked after loading; generated download URLs are revoked after a short delay.

This cleanup is **not a full browser-memory reset**. Shared runtime/worker caches remain loaded for reuse; JavaScript garbage collection and browser/driver allocation policies determine when unused memory is reclaimed. A browser memory graph is not guaranteed to fall immediately after a file replacement. Reloading the page recreates application state; closing the tab ends its viewer session.

## Limits and troubleshooting

The viewer accepts up to **40 MB total selected file bytes**, with a maximum of **2 million display vertices** and **2 million display triangles**. Complex files, conversion, or analysis can exhaust memory before these limits. Large ONNX grids have their own substantial allocations beyond the selected model's file size.

| Symptom | Check |
| --- | --- |
| Blank canvas on first open | A torus knot should appear automatically. Check WebGL support and module loading, or open your own model. |
| Failed module/worker loading | Use an HTTP server or HTTPS hosting rather than opening `index.html` directly. Preserve the complete `dist/` tree. |
| A referenced file cannot be found | Select the main model and companions together. Use folder opening when references include subdirectories. Preserve filenames and relative paths. |
| Engineering format/analysis fails initially | Check internet access for the Pyodide/package downloads. Basic mesh viewing through bundled loaders can still work. |
| Unsupported MSH/XML/DAT or other variant | An extension identifies a reader, not every possible file with that suffix. Check the format table and the reported error. |
| CAD loads no visible geometry | Curve-only files may contain no supported displayable faces. |
| ONNX model rejected | Check one dynamic float32 `[N,3]` input, one scalar float32 output, operator support, and external data selection. |
| Field has no visible surface | Check the model's normalization, bounds, scalar range, and level. A compatible interface does not guarantee a zero crossing inside the box. |
| Large field causes an allocation error | Choose a smaller grid or close other GPU-heavy work. Texture-dimension support does not guarantee sufficient memory. |
| Browser reports a 512 MiB upload-buffer error | Reload after replacing all application modules. Current uploads use independent chunks of at most 16 MiB; old cached code may still be active in an already-open tab. |
| GPU/context lost | Reopen the ONNX field to retry a lost WebGPU device. Reload the page after a lost WebGL context. |
| Measurements differ from a CAD/solver tool | Compare units, tessellation, triangulation, connectivity mode, static transforms, internal faces, and the untested properties above. |
| Missing conversion target | Some object types or element types cannot be faithfully encoded by that exporter. Exact CAD and ONNX-to-mesh export are unavailable. |

## Project structure

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/style.css`, `dist/app.js` | Viewer UI, scene, camera controls, file opening, and resource lifecycle |
| `dist/formats.js`, `dist/model-loaders.js` | Format registry and connections to established importers |
| `dist/cell-geometry.js` | Display adapter for engineering cells |
| `dist/worker-client.js`, `dist/mesh-worker.js`, `dist/cad-worker.js` | Independent parser workers and request plumbing |
| `dist/conversion.js` | Export options and library exporter integration |
| `dist/mesh-info.js` | Geometry capture and compact Info presentation |
| `dist/mesh-analysis-worker.js`, `dist/mesh-analysis.py` | Trimesh/NumPy/SciPy analysis reporting |
| `dist/sdf-inference.js` | ONNX Runtime integration and coordinate-grid sampling |
| `dist/sdf-view.js`, `dist/sdf-raymarch.wgsl` | WebGPU texture upload and field rendering |
| `dist/orientation-gizmo.js` | Passive SVG world-axis indicator |
| `dist/vendor/` | Bundled dependencies and their license/source notices |
| `serve.py`, `package.json` | Local launcher and optional syntax checks |
| `README.md`, `dist/README.md` | Repository documentation and its served copy |

Parsing, format serialization, neural inference, and mesh analysis are delegated to established libraries. Application code connects those libraries to local files and visualization.

### Validation scope

JavaScript syntax and module/asset paths have been checked. Development checks cover representative loaders, companion files, engineering mesh variants, CAD import, conversion round trips, original coordinates/connectivity, invalid-input recovery, geometry capture, topology measurements, resource cleanup, and UI DOM behavior.

The complete 256³ and 512³ sampling/upload paths have been exercised with a coordinate-plane ONNX fixture. WASM sampled values were checked, and shader/pipeline/texture/uniform/draw commands validated on Dawn's Null backend. Cleanup checks confirmed CPU-grid collection while views remain live, repeated disposal, failed-creation cleanup, and stable device-loss listener count.

Dawn Null does not execute rendered pixels. Real browser visual interaction, memory profiling, numerical GPU inference, and driver-specific rendering remain unverified in this development environment. Validation fixtures are not shipped as user-facing examples.

## Dependencies and licenses

| Dependency | Version | Purpose / license |
| --- | --- | --- |
| [Three.js](https://github.com/mrdoob/three.js/tree/r180) | 0.180.0 | WebGL scene, controls, importers/exporters; MIT. Bundled license: `dist/vendor/THREE-LICENSE.txt`. |
| [meshio](https://github.com/nschloe/meshio/tree/v5.3.5) | 5.3.5 | Engineering mesh I/O; MIT. Downloaded through Pyodide. |
| [Pyodide](https://pyodide.org/en/0.27.7/) | 0.27.7 | Python runtime; MPL-2.0, with separately licensed packages. |
| [Trimesh](https://github.com/mikedh/trimesh) | 5.1.1 | Mesh analysis; MIT. Wheel, provenance, and license under `dist/vendor/trimesh/`. |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime/tree/v1.30.0) | Web 1.30.0 | Coordinate-field inference; MIT. License: `dist/vendor/ort/LICENSE`. |
| [occt-import-js](https://github.com/kovacsv/occt-import-js) | 0.0.23 | Open CASCADE CAD import; LGPL-2.1 and its separately licensed Open CASCADE dependency. Notices under `dist/vendor/occt/`. |

NumPy, SciPy, HDF5/NetCDF support, geometry decoders, and other transitive components retain their respective licenses. Preserve bundled notices when redistributing. The unmodified occt-import-js importer package and sources are available from its [versioned npm archive](https://registry.npmjs.org/occt-import-js/-/occt-import-js-0.0.23.tgz); see its upstream repository for Open CASCADE source/build instructions.

Bundled loader adjustments: PLYLoader exposes `userData.hasFaces` to distinguish surfaces from point clouds. VTKLoader bounds its header probe by the input length so valid files shorter than 250 bytes can load. Other bundled importer files are unmodified.
