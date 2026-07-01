// =====================================================================
//  Printer Auto-Calibrate  -  Scan-based shrinkage / skew coupon
// ---------------------------------------------------------------------
//  An open lattice of measurement RINGS held together by thin ribs.
//
//  How it is meant to be used:
//    1. Print this part flat on the bed (no supports, single material).
//    2. Lay it on a flatbed scanner with a contrasting backing sheet
//       and scan at high DPI (>= 1200). Put the BED face (the chamfered
//       underside) down on the glass.
//    3. OpenCV fits a circle to every ring; the *centres* give true
//       X / Y scale and skew (immune to over/under-extrusion, because
//       extrusion changes a ring's wall width but not its centre).
//       The ring outer/inner diameters are read separately as a flow
//       (over-extrusion) diagnostic.
//
//  Rigidity:  the outer ribs are a thicker frame and the interior ribs
//  are full height, so the lattice does not bow when removed from the bed.
//  Elephant's foot:  every feature has a 45 deg chamfer on its underside,
//  so first-layer squish expands into the relief instead of past nominal.
//
//  Everything below is parametric - change a value and re-render.
// =====================================================================

// ---- Grid -----------------------------------------------------------
baseline   = 100;   // centre-to-centre span of the outermost rings (mm)
grid_n     = 5;     // rings per side  -> grid_n x grid_n rings

// ---- Rings ----------------------------------------------------------
ring_outer_d = 9;   // outer diameter of each ring (mm)
ring_wall    = 2.0; // wall thickness (mm)  -> inner_d = outer_d - 2*wall
ring_h       = 2.0; // ring height above the bed (mm)

// ---- Ribs / frame (the lattice that holds the rings together) -------
rib_w   = 2.5;      // width of the interior ribs (mm)
frame_w = 3.0;      // width of the four outer-edge ribs (stiff frame, mm)
rib_h   = 2.0;      // rib height (mm) - full height for maximum rigidity

// ---- Anti elephant's-foot chamfer (underside of the whole part) -----
chamfer   = 0.4;    // horizontal relief at the bottom edge (mm)
chamfer_h = 0.4;    // height of the chamfer band (mm); = chamfer -> 45 deg
                    // (keep chamfer < ring_wall/2 or the bottom wall vanishes)

// ---- Orientation fiducial -------------------------------------------
// The origin corner (min-X, min-Y) is printed as a SOLID disk, and a
// small satellite dot is added on its +X side. Together they let the
// software resolve the part's orientation unambiguously (all 4 rotations)
// without losing the origin ring as a usable measurement point.
fiducial_solid   = true;  // make the origin-corner ring a solid disk
fiducial_dot_d   = 3.5;   // satellite dot diameter, marks +X (mm)
fiducial_dot_gap = 4.0;   // gap from origin-ring edge to the dot (mm)

// ---- Optional printed reference strip -------------------------------
// NOTE: a printed reference shrinks too, so for TRUE scanner-scale
// calibration prefer a non-printed insert (steel rule / PCB) laid in
// the same scan. This strip is only a coarse sanity check -> off by default.
include_reference = false;
ref_pitch = 10;     // spacing of reference dots (mm)
ref_dot_d = 2.5;    // reference dot diameter (mm)

// ---- Quality --------------------------------------------------------
$fn = 96;           // facets per circle (higher = smoother edges)

// =====================================================================
//  Derived values  (don't edit)
// =====================================================================
pitch   = baseline / (grid_n - 1);
inner_d = ring_outer_d - 2 * ring_wall;
half    = baseline / 2;

function pos(i) = i * pitch - half;   // centre coordinate of index i

echo(str("pitch = ", pitch, " mm,  inner_d = ", inner_d,
         " mm,  rings = ", grid_n * grid_n,
         ",  bottom wall = ", ring_wall - 2 * chamfer, " mm"));
assert(inner_d > rib_w + 1,
       "inner_d too small for the rib width - increase ring_outer_d or reduce ring_wall/rib_w");
assert(chamfer < ring_wall / 2,
       "chamfer too large - it would eat through the bottom of the ring wall");

// =====================================================================
//  Chamfered primitives  (45 deg relief on the underside)
// =====================================================================
module ch_cyl(d, h) {                 // solid post, chamfered at the bottom
    if (chamfer > 0 && chamfer_h > 0) {
        cylinder(d1 = max(0.1, d - 2 * chamfer), d2 = d, h = chamfer_h);
        translate([0, 0, chamfer_h]) cylinder(d = d, h = h - chamfer_h);
    } else cylinder(d = d, h = h);
}

module ch_hole(d, h) {                 // hole cutter, relieved at the bottom
    if (chamfer > 0 && chamfer_h > 0) {
        translate([0, 0, -0.5]) cylinder(d = d + 2 * chamfer, h = 0.5);
        cylinder(d1 = d + 2 * chamfer, d2 = d, h = chamfer_h);
        translate([0, 0, chamfer_h]) cylinder(d = d, h = h - chamfer_h + 0.5);
    } else translate([0, 0, -0.5]) cylinder(d = d, h = h + 1);
}

module ch_bar_x(x0, yc, L, w, h) {     // bar along +X, chamfered long sides
    translate([x0, yc, 0])
        if (chamfer > 0 && chamfer_h > 0) {
            hull() {
                translate([0, -(w / 2 - chamfer), 0]) cube([L, w - 2 * chamfer, 0.01]);
                translate([0, -w / 2, chamfer_h])     cube([L, w, 0.01]);
            }
            translate([0, -w / 2, chamfer_h]) cube([L, w, h - chamfer_h]);
        } else translate([0, -w / 2, 0]) cube([L, w, h]);
}

module ch_bar_y(xc, y0, L, w, h) {     // bar along +Y, chamfered long sides
    translate([xc, y0, 0])
        if (chamfer > 0 && chamfer_h > 0) {
            hull() {
                translate([-(w / 2 - chamfer), 0, 0]) cube([w - 2 * chamfer, L, 0.01]);
                translate([-w / 2, 0, chamfer_h])     cube([w, L, 0.01]);
            }
            translate([-w / 2, 0, chamfer_h]) cube([w, L, h - chamfer_h]);
        } else translate([-w / 2, 0, 0]) cube([w, L, h]);
}

// =====================================================================
//  Geometry
// =====================================================================
module ribs() {
    for (j = [0 : grid_n - 1])          // rows (along X)
        ch_bar_x(-half, pos(j), baseline,
                 (j == 0 || j == grid_n - 1) ? frame_w : rib_w, rib_h);
    for (i = [0 : grid_n - 1])          // columns (along Y)
        ch_bar_y(pos(i), -half, baseline,
                 (i == 0 || i == grid_n - 1) ? frame_w : rib_w, rib_h);
}

module fiducial() {
    translate([pos(0) + ring_outer_d / 2 + fiducial_dot_gap, pos(0), 0])
        ch_cyl(fiducial_dot_d, ring_h);                 // +X satellite dot
    ch_bar_x(pos(0) + ring_outer_d / 2, pos(0),
             fiducial_dot_gap + 0.5, rib_w, rib_h);     // link to origin ring
}

module reference_strip() {
    ys  = -half - ring_outer_d * 1.5;
    cnt = floor(baseline / ref_pitch);
    for (k = [0 : cnt])
        translate([-half + k * ref_pitch, ys, 0]) ch_cyl(ref_dot_d, ring_h);
    ch_bar_x(-half, ys, baseline, rib_w, rib_h);                 // backbone
    for (lx = [pos(0), pos(grid_n - 1)])                         // links up
        ch_bar_y(lx, ys, (-half) - ys, rib_w, rib_h);
}

module coupon() {
    difference() {
        union() {
            for (i = [0 : grid_n - 1])
                for (j = [0 : grid_n - 1])
                    translate([pos(i), pos(j), 0]) ch_cyl(ring_outer_d, ring_h);
            ribs();
            fiducial();
            if (include_reference) reference_strip();
        }
        // punch the holes AFTER the union, so ribs crossing a ring never
        // block its centre. Skip the solid fiducial corner.
        for (i = [0 : grid_n - 1])
            for (j = [0 : grid_n - 1])
                if (!(fiducial_solid && i == 0 && j == 0))
                    translate([pos(i), pos(j), 0]) ch_hole(inner_d, ring_h);
    }
}

coupon();
