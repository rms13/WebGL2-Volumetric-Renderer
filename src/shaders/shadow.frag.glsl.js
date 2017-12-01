export default function(params) {
    return `#version 300 es
    precision highp float;
    precision highp sampler3D;
  
    // uniform sampler2D u_gbuffers[${params.numGBuffers}];
  
    in vec3 color;
    // in vec3 v_pos;
    // in vec2 v_uv;
  
    // uniform mat4 u_viewMatrix;
    // uniform mat4 u_invViewMatrix;
    // uniform mat4 u_viewProjectionMatrix;
  
    out vec4 out_Color;
  
    void main() 
    {   
        vec3 rgb = gl_FragCoord.xyz;
        out_Color = vec4(color,1.0);
    }
    `;
  }
  