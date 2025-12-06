// Vignette shader - darkens edges of the frame
// Adapted from hyper-mix

vec4 hook() {
    vec4 color = HOOKED_texOff(0);

    vec2 uv = HOOKED_pos;
    vec2 center = vec2(0.5, 0.5);

    float dist = distance(uv, center);
    float vignette = smoothstep(0.8, 0.2, dist);

    color.rgb *= mix(0.3, 1.0, vignette);

    return color;
}
