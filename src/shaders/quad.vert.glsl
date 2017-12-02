#version 300 es
precision highp float;

in vec3 a_position;

uniform mat4 u_viewProjectionMatrix;
uniform mat4 u_lightViewProjectionMatrix;

out vec4 v_pos;
out vec4 v_lightPosition;
out vec2 v_uv;

void main() {
    gl_Position = vec4(a_position, 1.0);

    v_pos = u_viewProjectionMatrix * vec4(a_position, 1.0);
    v_lightPosition = u_lightViewProjectionMatrix * vec4(a_position, 1.0);
    v_uv = a_position.xy * 0.5 + 0.5;
}
