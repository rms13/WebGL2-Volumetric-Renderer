export default function(params) {
    return `#version 300 es
    precision highp float;
    precision highp sampler3D;
  
    uniform sampler2D u_gbuffers[${params.numGBuffers}];
  
    in vec2 v_uv;
  
    uniform mat4 u_viewMatrix;
    uniform mat4 u_invViewMatrix;
  
    out vec4 out_Color;
  
    void main() 
    {
        const vec3 ambientLight = vec3(0.025);

        // Get position, color, and normal information from G-Buffer
        vec3 v_position = texture(u_gbuffers[0], v_uv).xyz;
        //vec3 albedo = texture(u_gbuffers[1], v_uv).xyz;
        vec3 normal = texture(u_gbuffers[2], v_uv).xyz;
  
        out_Color = vec4(0.0,1.0,0.0,1.0);
        return;
    }
    `;
  }
  