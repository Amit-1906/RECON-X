# Technical Architecture & Mathematical Specification

This document details the photogrammetric, computer vision, and computational geometry models implemented in the UAV Single-Pass 3D Reconstruction Platform.

---

## 1. Mathematical Foundations by Module

### 1.1 Preprocessing & Perceptual Equalization (`s01_preprocessing`)
UAV continuous video is sampled at a configured target temporal frequency $f_{target} \le f_{native}$:
$$\Delta t = \frac{f_{native}}{f_{target}}$$
Color normalization converts each BGR image $I$ to the CIELAB perceptual color space:
$$I_{LAB} = \mathcal{T}_{BGR \to LAB}(I)$$
Contrast-Limited Adaptive Histogram Equalization (CLAHE) is applied exclusively to the luminance channel $L^*$ using a Rayleigh clip limit $\beta$:
$$L^*_{equalized} = \text{CLAHE}(L^*, \beta, \text{grid}=(8, 8))$$
This preserves chromatic integrity while preventing over-amplification of atmospheric haze and sensor noise.

---

### 1.2 Frame Quality Assessment (`s02_frame_quality`)
Per-frame focus and high-frequency sharpness are measured using the variance of the discrete 2D Laplace operator:
$$\Delta I(x, y) = \frac{\partial^2 I}{\partial x^2} + \frac{\partial^2 I}{\partial y^2}$$
$$\mathcal{S}_{sharpness} = \text{Var}(\Delta I) = \frac{1}{WH} \sum_{x, y} (\Delta I(x, y) - \mu_{\Delta I})^2$$
Motion-blurred frames or out-of-focus captures have low variance and are filtered before expensive feature matching.

---

### 1.3 Intelligent Keyframe Selection (`s03_keyframe_selection`)
To guarantee stereoscopic parallax while minimizing redundant computations, inter-frame visual baseline displacement is estimated using dense Farneback optical flow:
$$\mathbf{v}(x, y) = [u(x, y), v(x, y)]^T$$
$$\bar{D}_{motion} = \text{median}\left(\sqrt{u(x, y)^2 + v(x, y)^2}\right)$$
Frames with $\bar{D}_{motion} \ge D_{min}$ and composite quality score above threshold are retained as keyframes.

---

### 1.4 Camera Pose Estimation (`s04_pose_estimation`)
Camera intrinsics $K$ are synthesized from focal length $f_{mm}$, sensor width $S_w$, and image resolution $(W, H)$:
$$K = \begin{bmatrix} f_x & 0 & c_x \\ 0 & f_y & c_y \\ 0 & 0 & 1 \end{bmatrix}, \quad f_x = f_y = \frac{f_{mm}}{S_w} W, \quad c_x = \frac{W}{2}, \quad c_y = \frac{H}{2}$$

For matched keypoint correspondences $\mathbf{x}_1 \leftrightarrow \mathbf{x}_2$ satisfying Lowe's ratio test:
$$\frac{\|\mathbf{d}_{1} - \mathbf{d}_{2, \text{best}}\|}{\|\mathbf{d}_{1} - \mathbf{d}_{2, \text{2nd best}}\|} < \tau \quad (\tau = 0.80)$$
The Essential Matrix $E$ satisfies the epipolar constraint:
$$\mathbf{x}_2^T K^{-T} E K^{-1} \mathbf{x}_1 = 0, \quad E = [\mathbf{t}]_\times R$$
RANSAC minimizes epipolar reprojection distance. Relative pose $(R_{rel}, \mathbf{t}_{rel})$ is decomposed using Singular Value Decomposition (SVD), accumulating camera trajectory along the flight path:
$$R_i = R_{rel} R_{i-1}, \quad \mathbf{t}_i = R_{rel} \mathbf{t}_{i-1} + \mathbf{t}_{rel\_scaled}$$
$$\mathbf{C}_i = -R_i^T \mathbf{t}_i \quad (\text{Camera center in world coordinates})$$

---

### 1.5 3D Sparse Geometry Triangulation (`s05_geometry`)
Projection matrices for calibrated camera stations:
$$P_1 = K [R_1 \mid \mathbf{t}_1], \quad P_2 = K [R_2 \mid \mathbf{t}_2]$$
Homogeneous coordinates $\mathbf{X}_w = [X, Y, Z, W]^T$ are triangulated via Direct Linear Transformation (DLT):
$$\begin{bmatrix} x_1 P_{1, 3}^T - P_{1, 1}^T \\ y_1 P_{1, 3}^T - P_{1, 2}^T \\ x_2 P_{2, 3}^T - P_{2, 1}^T \\ y_2 P_{2, 3}^T - P_{2, 2}^T \end{bmatrix} \mathbf{X}_w = \mathbf{0}$$
Points must satisfy the chirality constraint (positive depth in both cameras) and reprojection residual tolerance:
$$\mathbf{X}_{c1} = R_1 \frac{\mathbf{X}_w}{W} + \mathbf{t}_1, \quad Z_{c1} > 0 \quad \text{and} \quad Z_{c2} > 0$$
$$\epsilon_{reproj} = \frac{1}{2} \sum_{i=1}^2 \left\| \mathbf{x}_i - \pi(K, R_i, \mathbf{t}_i, \mathbf{X}_w) \right\|_2 \le \epsilon_{max}$$

---

### 1.6 Dense Stereo Disparity Point Cloud (`s06_dense_point_cloud`)
Semi-Global Block Matching (StereoSGBM) optimizes an energy function with Birchfield-Tomasi pixel dissimilarity and smoothness regularization:
$$E(D) = \sum_{\mathbf{p}} C(\mathbf{p}, D(\mathbf{p})) + \sum_{\mathbf{q} \in N_{\mathbf{p}}} P_1 \cdot \mathbb{I}[|D(\mathbf{p}) - D(\mathbf{q})| = 1] + \sum_{\mathbf{q} \in N_{\mathbf{p}}} P_2 \cdot \mathbb{I}[|D(\mathbf{p}) - D(\mathbf{q})| > 1]$$
Metric depth $Z_c$ is derived from stereo baseline $B$ and focal length $f_x$:
$$Z_c = \frac{f_x \cdot B}{D(\mathbf{p})}$$
$$X_c = \frac{(u - c_x) Z_c}{f_x}, \quad Y_c = \frac{(v - c_y) Z_c}{f_y}$$
World coordinates: $\mathbf{X}_w = R^T (\mathbf{X}_c - \mathbf{t})$.

---

### 1.7 Polygonal Surface Mesh Generation (`s07_mesh_generation`)
A 2.5D Delaunay Triangulated Irregular Network (TIN) is constructed over horizontal coordinates $(X_w, Y_w)$:
$$\mathcal{DT}(P) = \{ T \in \mathcal{T} \mid \text{Circumcircle}(T) \cap P = \emptyset \}$$
Degenerate triangles with edge length $e_{ij} > e_{max}$ are pruned to eliminate interpolation over gaps.
Surface normal $\mathbf{N}_f$ for triangle vertices $(\mathbf{v}_1, \mathbf{v}_2, \mathbf{v}_3)$:
$$\mathbf{N}_f = \frac{(\mathbf{v}_2 - \mathbf{v}_1) \times (\mathbf{v}_3 - \mathbf{v}_1)}{\|(\mathbf{v}_2 - \mathbf{v}_1) \times (\mathbf{v}_3 - \mathbf{v}_1)\|}$$

---

### 1.8 Georeferencing & Sim(3) Helmert Transformation (`s09_georeferencing`)
Transforms local coordinates $\mathbf{X}_{local}$ to real-world geodetic Web Mercator coordinates (EPSG:3857) via a 7-parameter similarity transformation:
$$\mathbf{X}_{geo} = s R_{hel} \mathbf{X}_{local} + \mathbf{T}_{hel}$$
Where $s$ is the metric scale factor, $R_{hel} \in SO(3)$ is the orientation matrix, and $\mathbf{T}_{hel} = [X_{Easting}, Y_{Northing}, Z_{Alt}]^T$ aligns to the UAV GNSS origin.

---

### 1.9 Ground Sample Distance (GSD) Validation (`s11_validation`)
The photogrammetric Ground Sample Distance represents the physical distance on the ground between two adjacent pixel centers:
$$\text{GSD} = \frac{H_{altitude} \times S_{width}}{f_{lens} \times W_{pixels}} \times 100 \quad [\text{cm/pixel}]$$
Validation verifies compliance with target engineering tolerances ($\pm 35\%$).
