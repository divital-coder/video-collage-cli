// Dreamy / soft glow shader
// Creates a soft, ethereal look with bloom and desaturation

vec4 hook() {
    vec4 color = HOOKED_texOff(0);

    // Soft blur for glow
    vec4 blur = vec4(0.0);
    float total = 0.0;
    for (int x = -3; x <= 3; x++) {
        for (int y = -3; y <= 3; y++) {
            float weight = 1.0 / (1.0 + float(abs(x) + abs(y)) * 0.5);
            blur += HOOKED_texOff(vec2(float(x), float(y))) * weight;
            total += weight;
        }
    }
    blur /= total;

    // Mix original with blur for soft glow
    vec3 glow = mix(color.rgb, blur.rgb, 0.4);

    // Slight desaturation
    float luminance = dot(glow, vec3(0.299, 0.587, 0.114));
    glow = mix(vec3(luminance), glow, 0.85);

    // Lift shadows slightly
    glow = glow * 0.9 + 0.1;

    // Vignette
    vec2 uv = HOOKED_pos;
    float dist = distance(uv, vec2(0.5));
    float vignette = smoothstep(0.7, 0.3, dist);
    glow *= mix(0.7, 1.0, vignette);

    return vec4(glow, 1.0);
}
