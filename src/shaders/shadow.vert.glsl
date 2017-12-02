#version 300 es
precision highp float;

in vec3 a_position;

// This will be from the light's perpsective
uniform mat4 u_viewProjectionMatrix;
// Take the point back to its model
// uniform mat4 u_invViewProjectionMatrix;

out vec3 color;
// out vec3 v_pos;
// out vec2 v_uv;

void main() 
{
    gl_Position = vec4(a_position, 1.0);

    // color = a_position;

    // gl_Position = u_viewProjectionMatrix * vec4(a_position, 1.0);
    
    // v_pos = a_position;
    // v_uv = a_position.xy * 0.5 + 0.5;
}
