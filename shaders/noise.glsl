// Film grain / noise shader
// Adds organic film-like texture

float random(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 hook() {
    vec4 color = HOOKED_texOff(0);
    vec2 uv = HOOKED_pos;

    // Generate noise based on position and frame
    float noise = random(uv * 1000.0 + vec2(random(uv), random(uv.yx)));

    // Subtle grain amount
    float amount = 0.08;
    color.rgb += (noise - 0.5) * amount;

    return color;
}
