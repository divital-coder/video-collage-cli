// CRT monitor effect shader
// Simulates old CRT display with scanlines and curvature

vec4 hook() {
    vec2 uv = HOOKED_pos;
    vec2 center = vec2(0.5, 0.5);

    // Barrel distortion (CRT curvature)
    vec2 dc = uv - center;
    float dist = length(dc);
    float distortion = 0.1;
    vec2 curved_uv = uv + dc * dist * dist * distortion;

    // Check bounds
    if (curved_uv.x < 0.0 || curved_uv.x > 1.0 || curved_uv.y < 0.0 || curved_uv.y > 1.0) {
        return vec4(0.0, 0.0, 0.0, 1.0);
    }

    vec4 color = HOOKED_tex(curved_uv);

    // Scanlines
    float scanline = sin(curved_uv.y * HOOKED_size.y * 3.14159) * 0.5 + 0.5;
    scanline = pow(scanline, 0.5);
    color.rgb *= mix(0.8, 1.0, scanline);

    // RGB phosphor pattern
    float pixel = mod(floor(curved_uv.x * HOOKED_size.x), 3.0);
    if (pixel == 0.0) color.r *= 1.1;
    else if (pixel == 1.0) color.g *= 1.1;
    else color.b *= 1.1;

    // Vignette
    float vignette = 1.0 - dist * 0.8;
    color.rgb *= vignette;

    return color;
}
