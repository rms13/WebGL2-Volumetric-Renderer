export default function(params) {
  return `#version 300 es
  precision highp float;

  uniform sampler2D u_lightbuffer;
  
  uniform sampler2D u_gbuffers[${params.numGBuffers}];
  
  in vec2 v_uv;

  uniform sampler2D u_clusterbuffer;
  uniform mat4 u_viewMatrix;
  uniform float u_screenW;
  uniform float u_screenH;
  uniform float u_camN;
  uniform float u_camF;
  uniform vec3 u_camPos;

  out vec4 out_Color;

  struct Light {
    vec3 position;
    float radius;
    vec3 color;
  };

  float ExtractFloat(sampler2D textureToSample, int textureWidth, int textureHeight, int index, int component) {
    float u = float(index + 1) / float(textureWidth + 1);
    int pixel = component / 4;
    float v = float(pixel + 1) / float(textureHeight + 1);
    vec4 texel = texture(textureToSample, vec2(u, v));
    int pixelComponent = component - pixel * 4;
    if (pixelComponent == 0) {
      return texel[0];
    } else if (pixelComponent == 1) {
      return texel[1];
    } else if (pixelComponent == 2) {
      return texel[2];
    } else if (pixelComponent == 3) {
      return texel[3];
    }
  }

  Light UnpackLight(int index) {
    Light light;
    float u = float(index + 1) / float(${params.numLights + 1});
    vec4 v1 = texture(u_lightbuffer, vec2(u, 0.0));
    vec4 v2 = texture(u_lightbuffer, vec2(u, 0.5));
    light.position = v1.xyz;
    light.radius = ExtractFloat(u_lightbuffer, ${params.numLights}, 2, index, 3);
    light.color = v2.rgb;
    return light;
  }

  // Cubic approximation of gaussian curve so we falloff to exactly 0 at the light radius
  float cubicGaussian(float h) {
    if (h < 1.0) {
      return 0.25 * pow(2.0 - h, 3.0) - pow(1.0 - h, 3.0);
    } else if (h < 2.0) {
      return 0.25 * pow(2.0 - h, 3.0);
    } else {
      return 0.0;
    }
  }

  void main() {
    // 2 COMPONENT NORMALS:
    // vec4 gb0 = texture(u_gbuffers[0], v_uv);
    // vec4 gb1 = texture(u_gbuffers[1], v_uv);
    // vec3 v_position = gb0.xyz;
    // vec3 albedo = gb1.rgb;
    // vec3 normal = vec3(gb0.w, gb1.w, sqrt(abs(1.0 - gb0.w * gb0.w - gb1.w * gb1.w)));// z2 = 1 - x2 - y2..

    vec3 v_position = texture(u_gbuffers[0], v_uv).xyz;
    vec3 albedo = texture(u_gbuffers[1], v_uv).xyz;
    vec3 normal = texture(u_gbuffers[2], v_uv).xyz;

    vec3 fragColor = vec3(0.0);

    ivec3 clusterPos = ivec3(
      int(gl_FragCoord.x / u_screenW * float(${params.xSlices})),
      int(gl_FragCoord.y / u_screenH * float(${params.ySlices})),
      int((-(u_viewMatrix * vec4(v_position,1.0)).z - u_camN) / (u_camF - u_camN) * float(${params.zSlices}))
    );
    
    // optimize z using non linear scale once linear works..
    // show perf. comparison..

    // use UnpackLight() logic to read lightIdx, and then use UnpackLight() to read light from that idx..

    int clusterIdx = clusterPos.x + clusterPos.y * ${params.xSlices} + clusterPos.z * ${params.xSlices} * ${params.ySlices};
    int clusterWidth = ${params.xSlices} * ${params.ySlices} * ${params.zSlices};
    int clusterHeight = int(float(${params.maxLights}+1) / 4.0) + 1;
    float clusterU = float(clusterIdx + 1) / float(clusterWidth + 1); // like u in UnpackLight()..

    int numLights = int(texture(u_clusterbuffer, vec2(clusterU, 0.0)).x); // clamp to max lights in scene if this misbehaves..

    // DIRECTIONAL LIGHT - SUN
    vec3 sunDir = normalize(vec3(1.0, 0.5, 1.0));
    vec3 sunCol = vec3(0.5, 0.5, 0.4);
    fragColor += albedo * sunCol * max(dot(sunDir, normal), 0.05);

    for (int i = 0; i < ${params.numLights}; i++) {
      if(i >= numLights) {
        break;
      }

      int clusterPixel = int(float(i+1) / 4.0); // FIXED BUG: offset by 1
      float clusterV = float(clusterPixel+1) / float(clusterHeight+1);
      vec4 texel = texture(u_clusterbuffer, vec2(clusterU, clusterV));
      int lightIdx;
      int clusterPixelComponent = (i+1) - (clusterPixel * 4);
      if (clusterPixelComponent == 0) {
          lightIdx = int(texel[0]);
      } else if (clusterPixelComponent == 1) {
          lightIdx = int(texel[1]);
      } else if (clusterPixelComponent == 2) {
          lightIdx = int(texel[2]);
      } else if (clusterPixelComponent == 3) {
          lightIdx = int(texel[3]);
      }

      // shading
      Light light = UnpackLight(lightIdx);
      float lightDistance = distance(light.position, v_position);
      vec3 L = (light.position - v_position) / lightDistance;

      float lightIntensity = cubicGaussian(2.0 * lightDistance / light.radius);
      float lambertTerm = max(dot(L, normal), 0.0);

      float specular = 0.0;
      // blinn-phong shading... https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_shading_model
      vec3 viewDir = normalize(u_camPos - v_position);
      vec3 halfDir = normalize(L + viewDir);
      float specAngle = max(dot(halfDir, normal), 0.0);
      specular = pow(specAngle, 100.0); // 100 -> shininess

      fragColor += (albedo + vec3(specular)) * lambertTerm * light.color * vec3(lightIntensity);
    }

    const vec3 ambientLight = vec3(0.025);
    fragColor += albedo * ambientLight;

    out_Color = vec4(fragColor, 1.0);
  }
  `;
}
