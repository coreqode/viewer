"""Reporting adapter for Trimesh 5.1.1, NumPy and SciPy; no mesh repair."""
import gc
import json
import numpy as np
import trimesh
from scipy.sparse.csgraph import connected_components


def stats(values):
    values = np.asarray(values)
    if not values.size:
        return None
    return dict(min=float(values.min()), mean=float(values.mean()), max=float(values.max()))


def boundary_info(edges):
    if not len(edges):
        return dict(vertices=0, groups=0, loops=0, branched_vertices=0)
    vertices, inverse = np.unique(edges, return_inverse=True)
    degree = np.bincount(inverse.reshape(-1).astype(np.intp), minlength=len(vertices))
    graph = trimesh.graph.edges_to_coo(inverse.reshape(-1, 2), count=len(vertices))
    groups = int(connected_components(graph, directed=False, return_labels=False))
    return dict(vertices=len(vertices), groups=groups,
                loops=groups if np.all(degree == 2) else None,
                branched_vertices=int((degree > 2).sum()))


def analyze_part(part, weld):
    vertices = np.asarray(part['positions'], dtype=np.float64).reshape(-1, 3)
    indices = np.asarray(part['indices'], dtype=np.int64)
    if not np.isfinite(vertices).all() or (indices.size and (indices.min() < 0 or indices.max() >= len(vertices))):
        raise ValueError('Invalid positions or indices in ' + part['name'])
    result = {key: part[key] for key in ('name', 'kind', 'indexed', 'attributes', 'vertex_records', 'primitives')}
    referenced = np.unique(indices)
    result['referenced_vertices'] = len(referenced)
    result['unreferenced_vertices'] = len(vertices) - len(referenced)
    if not indices.size:
        return result
    selected = vertices[referenced]
    bounds = np.array([selected.min(axis=0), selected.max(axis=0)])
    result.update(bounds=bounds.tolist(), extents=(bounds[1] - bounds[0]).tolist())
    if part['kind'] == 'points':
        result['unique_positions'] = len(np.unique(vertices[indices], axis=0))
        result['duplicate_positions'] = len(indices) - result['unique_positions']
        return result
    if part['kind'] == 'lines':
        edges = indices.reshape(-1, 2)
        lengths = np.linalg.norm(vertices[edges[:, 1]] - vertices[edges[:, 0]], axis=1)
        _, remap = np.unique(edges, return_inverse=True)
        graph = trimesh.graph.edges_to_coo(remap.reshape(-1, 2), count=len(referenced))
        result.update(length=float(lengths.sum()), segment_lengths=stats(lengths),
                      zero_length_segments=int((lengths == 0).sum()),
                      components=int(connected_components(graph, directed=False, return_labels=False)))
        return result
    raw = trimesh.Trimesh(vertices=vertices, faces=indices.reshape(-1, 3), process=False, validate=False)
    result.update(area=float(raw.area), triangle_areas=stats(raw.area_faces),
                  triangle_angles_degrees=stats(np.degrees(raw.face_angles)))
    if raw.area > 0:
        result['surface_centroid'] = raw.centroid.tolist()
    # Normalize only an independent topology copy. Measurements keep loader coordinates.
    topology = trimesh.Trimesh(vertices=vertices.copy(), faces=indices.reshape(-1, 3).copy(), process=False, validate=False)
    diagonal = float(np.linalg.norm(bounds[1] - bounds[0]))
    scale = diagonal if diagonal > 0 else 1.0
    topology.apply_translation(-bounds.mean(axis=0))
    topology.apply_scale(1.0 / scale)
    topology.remove_unreferenced_vertices()
    before = len(topology.vertices)
    if weld:
        topology.merge_vertices(digits_vertex=8, merge_tex=True, merge_norm=True)
    count = np.bincount(topology.edges_unique_inverse.astype(np.intp), minlength=len(topology.edges_unique))
    boundary = topology.edges_unique[count == 1]
    duplicate_faces = int((~topology.unique_faces()).sum())
    degenerate_faces = int((~topology.nondegenerate_faces(height=1e-12)).sum())
    watertight = bool(topology.is_watertight)
    winding = bool(topology.is_winding_consistent)
    result.update(topology_vertices=len(topology.vertices), merged_vertices=before-len(topology.vertices),
                  unique_edges=len(topology.edges_unique), boundary_edges=int((count == 1).sum()),
                  two_face_edges=int((count == 2).sum()), nonmanifold_edges=int((count > 2).sum()),
                  boundary=boundary_info(boundary), components=int(topology.body_count),
                  euler=int(topology.euler_number), watertight=watertight, winding_consistent=winding,
                  duplicate_triangles=duplicate_faces, degenerate_triangles=degenerate_faces,
                  edge_lengths=stats(topology.edges_unique_length * scale),
                  incident_faces=stats(topology.vertex_degree),
                  vertex_valence=stats(np.bincount(topology.edges_unique.reshape(-1).astype(np.intp), minlength=len(topology.vertices))),
                  relative_weld_precision=1e-8 if weld else None)
    # Edge closure alone is insufficient for solid validity: explicitly report limits in the UI.
    if watertight and winding and not duplicate_faces and not degenerate_faces:
        signed_volume = float(raw.volume)
        result['signed_volume'] = signed_volume
        result['volume_magnitude'] = abs(signed_volume)
        if signed_volume != 0:
            result['volume_centroid'] = raw.center_mass.tolist()
        result['convex'] = bool(topology.is_convex)
    return result


def analyze_parts(parts, weld):
    results = []
    for part in parts:
        try:
            results.append(analyze_part(part, weld))
        except Exception as error:
            results.append(dict(name=part['name'], kind=part['kind'], error=str(error)))
        gc.collect()
    return dict(engine='Trimesh ' + trimesh.__version__ + ' / NumPy / SciPy',
                connectivity='position-welded per object, normalized diagonal, 8 decimal places' if weld else 'loaded indices per object',
                parts=results,
                unchecked=['Self-intersections', 'Intersections between objects', 'Vertex manifoldness', 'Orientability proof', 'Genus', 'Exact CAD topology', 'Volume-cell adjacency and quality'])
