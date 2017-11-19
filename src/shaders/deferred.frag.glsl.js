export default function(params) {
  return `#version 300 es
  precision highp float;
  precision highp sampler3D;

  uniform sampler2D u_lightbuffer;
  
  uniform sampler2D u_gbuffers[${params.numGBuffers}];

  uniform sampler3D u_volBuffer;
  
  in vec2 v_uv;

  uniform sampler2D u_clusterbuffer;
  uniform mat4 u_viewMatrix;
  uniform mat4 u_invViewMatrix;
  uniform float u_screenW;
  uniform float u_screenH;
  uniform float u_camN;
  uniform float u_camF;
  uniform vec3 u_camPos;

  uniform float u_time;
  uniform float u_volSize;
  //uniform vec3 u_volPos;
  uniform mat4 u_volTransMat;
  uniform mat4 u_invVolTransMat;
  uniform mat4 u_invTranspVolTransMat;

  out vec4 out_Color;

  #define ABSORBTION 0.006
  #define SCATTERING 0.009
  #define EXTINCTION ABSORBTION + SCATTERING
  #define DENSITY 0.5
  #define PI 3.14159265

  #define NUM_STEPS 100

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

  float transmittance(vec3 p1, vec3 p2)
  {
    float exponent = -EXTINCTION * DENSITY * distance(p1, p2);

    return exp(exponent);
  }

  float phaseFunction(vec3 wo, vec3 wi, float g)
  {
    float dot = dot(wo, wi);
    float cosTheta = cos(dot);

    float num = 1.0f - (g * g);
    float denom = 4.0f * PI * pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5);

    return num / denom;
  }

  vec2 intersectCube(vec3 p, vec3 dir)
  {
    float tNear = -1000.0;
    float tFar  = 1000.0;

    float min = -u_volSize / 2.0;
    float max = u_volSize / 2.0;

    for(int i = 0; i < 3; i++) {
      // X-Slab
      if(dir[i] == 0.0) {
        if(p[i] < min || p[i] > max) {
          // miss
          return vec2(2000.0, 2000.0);
        }
      }

      float t0 = (min - p[i]) / dir[i];
      float t1 = (max - p[i]) / dir[i];

      if(t0 > t1) {
        // swap
        float t = t0;
        t0 = t1;
        t1 = t;
      }

      if(t0 > tNear) {
        tNear = t0;
      }

      if(t1 < tFar) {
        tFar = t1;
      }
    }

    if(tNear > tFar) {
      // miss 
      return vec2(2000.0, 2000.0);
    }

    return vec2(tNear, tFar);
  }

  void main() {
    const vec3 ambientLight = vec3(0.025);
    
    // float zoom = 1.0;
    // vec2 coordVol = vec2(u_screenW / 2.0, u_screenH / 2.0);
    // float halfVolSize = u_volSize / 2.0;
    // if(gl_FragCoord.x > coordVol.x - halfVolSize * zoom && gl_FragCoord.x < coordVol.x + halfVolSize * zoom
    //   && gl_FragCoord.y > coordVol.y - halfVolSize * zoom && gl_FragCoord.y < coordVol.y + halfVolSize * zoom) {
    //     vec2 coord = gl_FragCoord.xy - coordVol.xy + vec2(halfVolSize, halfVolSize) * zoom;
    //     out_Color = texture(u_volBuffer, vec3(coord/u_volSize/zoom, u_time/u_volSize));
    //     out_Color.xyz = out_Color.xxx;
    // }
    // else {

      // 2 COMPONENT NORMALS:
      // vec4 gb0 = texture(u_gbuffers[0], v_uv);
      // vec4 gb1 = texture(u_gbuffers[1], v_uv);
      // vec3 v_position = gb0.xyz;
      // vec3 albedo = gb1.rgb;
      // vec3 normal = vec3(gb0.w, gb1.w, sqrt(abs(1.0 - gb0.w * gb0.w - gb1.w * gb1.w)));// z2 = 1 - x2 - y2..

      // Get position, color, and normal information from G-Buffer
      vec3 v_position = texture(u_gbuffers[0], v_uv).xyz;
      vec3 albedo = texture(u_gbuffers[1], v_uv).xyz;
      vec3 normal = texture(u_gbuffers[2], v_uv).xyz;

      vec3 fragColor = vec3(0.0);

      // DIRECTIONAL LIGHT - SUN
      vec3 sunDir = normalize(vec3(-1.0, 1.0, -1.0));
      vec3 sunCol = 0.5*vec3(0.5, 0.5, 0.4);
      // fragColor += albedo * sunCol * max(dot(sunDir, normal), 0.05);

      //-- Naive Volumetric Ray March
      // Make a ray from the camera to the point in world space.
      vec3 rayOrigin    = u_camPos;
      vec3 rayDirection = (v_position - rayOrigin);
      float len = length(rayDirection);

      //if(albedo.x != 0.0 && albedo.y != 0.0 && albedo.z != 0.0) {

      

      rayDirection = normalize(rayDirection);

      // Take the ray to the volumetric cube space
      vec3 rayOriginVol = (u_invVolTransMat * vec4(rayOrigin, 1.0)).xyz;
      vec3 rayDirectionVol = (u_invTranspVolTransMat * vec4(rayDirection, 1.0)).xyz;

      vec2 tValues = intersectCube(rayOriginVol, rayDirectionVol);
      
      // if(tValues.x > 1000.0) {
      //   // fragColor += albedo * ambientLight;  
      //   fragColor = vec3(0.0, 1.0, 0.0);
      //   //out_Color = vec4(fragColor, 1.0);            
      // }
      // else if (true/* && tValues.x>-u_volSize / 2.0 && tValues.x<u_volSize / 2.0 && tValues.y>-u_volSize / 2.0 && tValues.y<u_volSize / 2.0*/) {
      //   // fragColor = vec3(1.0, 0.0, 0.0);
      //   fragColor = vec3(1.0, 0.0,0.0);
      // }
      // else if (true) {
      //   fragColor = vec3(0.0, 0.0, 1.0);
      // }
     // else 
      {
        float tNear = tValues.x;
        float tFar = tValues.y;

        // float rayLength = length(rayDirectionVol);
        float rayLength = abs(tFar - tNear);
        rayDirectionVol = normalize(rayDirectionVol);
  
        float stepSize = rayLength / float(NUM_STEPS);
  
        float pmAlbedo = SCATTERING / EXTINCTION;
  
        vec3 fog = vec3(0.0);
        for(float i = tNear; i <= rayLength && i <= tFar; i += stepSize) {
          // Get ray marched point
          vec3 p = rayOriginVol + (i * rayDirectionVol);
  
          // Find transmittance from camera to ray marched point and add to overall
          float tr = transmittance(rayOriginVol, p);
  
          // Solve Lscat
          // TODO: Loop through all the lights
          // TODO: Check for occlusion
  
          // Just use the sun as the only light source for now
          vec3 Li = vec3(0.0);
          vec3 sunDirVol = vec3(u_invTranspVolTransMat * vec4(sunDir, 1.0));
          vec3 normalVol = (u_invTranspVolTransMat * vec4(normal, 0.0)).xyz; 
          if(dot(normalVol, sunDirVol) > 0.0) {
            Li = sunCol ;//* max(dot(sunDirVol, normalVol), 0.05);
          }
  
          vec3 sum = phaseFunction(rayDirectionVol, sunDirVol, -0.5) * transmittance(rayOriginVol, sunDirVol) * Li;
  
          vec3 Lscat = pmAlbedo * sum;
  
          // Accumulate 
          fog += tr * EXTINCTION * Lscat;
        }

        vec4 pos = u_invVolTransMat * vec4(v_position, 1.0);
        vec3 sunDirVol = vec3(u_invTranspVolTransMat * vec4(sunDir, 1.0));
        vec3 normalVol = (u_invTranspVolTransMat * vec4(normal, 0.0)).xyz;
        fragColor += (transmittance(rayOrigin, v_position) *  max(dot(sunDirVol, normalVol), 0.05) * albedo * ambientLight) + fog;      
        // fragColor += fog;      
      }

      out_Color = vec4(fragColor, 1.0);
      //out_Color = texture(u_volBuffer, vec3(v_uv, 8));
      //out_Color = texture(u_volBuffer, vec3( v_uv.xy - coordVol.xy + vec2(16.0, 16.0), 8));


      // if(fract(v_position.x)<0.1) {
      //   out_Color = vec4(1.0, 0.0,0.0,0.0);
      // }


    //} // end len>0.00001
    }
  // }

  // void main() {
  //   // 2 COMPONENT NORMALS:
  //   // vec4 gb0 = texture(u_gbuffers[0], v_uv);
  //   // vec4 gb1 = texture(u_gbuffers[1], v_uv);
  //   // vec3 v_position = gb0.xyz;
  //   // vec3 albedo = gb1.rgb;
  //   // vec3 normal = vec3(gb0.w, gb1.w, sqrt(abs(1.0 - gb0.w * gb0.w - gb1.w * gb1.w)));// z2 = 1 - x2 - y2..

  //   vec3 v_position = texture(u_gbuffers[0], v_uv).xyz;
  //   vec3 albedo = texture(u_gbuffers[1], v_uv).xyz;
  //   vec3 normal = texture(u_gbuffers[2], v_uv).xyz;

  //   vec3 fragColor = vec3(0.0);

  //   ivec3 clusterPos = ivec3(
  //     int(gl_FragCoord.x / u_screenW * float(${params.xSlices})),
  //     int(gl_FragCoord.y / u_screenH * float(${params.ySlices})),
  //     int((-(u_viewMatrix * vec4(v_position,1.0)).z - u_camN) / (u_camF - u_camN) * float(${params.zSlices}))
  //   );
    
  //   // optimize z using non linear scale once linear works..
  //   // show perf. comparison..

  //   // use UnpackLight() logic to read lightIdx, and then use UnpackLight() to read light from that idx..

  //   int clusterIdx = clusterPos.x + clusterPos.y * ${params.xSlices} + clusterPos.z * ${params.xSlices} * ${params.ySlices};
  //   int clusterWidth = ${params.xSlices} * ${params.ySlices} * ${params.zSlices};
  //   int clusterHeight = int(float(${params.maxLights}+1) / 4.0) + 1;
  //   float clusterU = float(clusterIdx + 1) / float(clusterWidth + 1); // like u in UnpackLight()..

  //   int numLights = int(texture(u_clusterbuffer, vec2(clusterU, 0.0)).x); // clamp to max lights in scene if this misbehaves..

  //   // DIRECTIONAL LIGHT - SUN
  //   vec3 sunDir = normalize(vec3(1.0, 0.5, 1.0));
  //   vec3 sunCol = vec3(0.5, 0.5, 0.4);
  //   fragColor += albedo * sunCol * max(dot(sunDir, normal), 0.05);

  //   for (int i = 0; i < ${params.numLights}; i++) {
  //     if(i >= numLights) {
  //       break;
  //     }

  //     int clusterPixel = int(float(i+1) / 4.0); // FIXED BUG: offset by 1
  //     float clusterV = float(clusterPixel+1) / float(clusterHeight+1);
  //     vec4 texel = texture(u_clusterbuffer, vec2(clusterU, clusterV));
  //     int lightIdx;
  //     int clusterPixelComponent = (i+1) - (clusterPixel * 4);
  //     if (clusterPixelComponent == 0) {
  //         lightIdx = int(texel[0]);
  //     } else if (clusterPixelComponent == 1) {
  //         lightIdx = int(texel[1]);
  //     } else if (clusterPixelComponent == 2) {
  //         lightIdx = int(texel[2]);
  //     } else if (clusterPixelComponent == 3) {
  //         lightIdx = int(texel[3]);
  //     }

  //     // shading
  //     Light light = UnpackLight(lightIdx);
  //     float lightDistance = distance(light.position, v_position);
  //     vec3 L = (light.position - v_position) / lightDistance;

  //     float lightIntensity = cubicGaussian(2.0 * lightDistance / light.radius);
  //     float lambertTerm = max(dot(L, normal), 0.0);

  //     float specular = 0.0;
  //     // blinn-phong shading... https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_shading_model
  //     vec3 viewDir = normalize(u_camPos - v_position);
  //     vec3 halfDir = normalize(L + viewDir);
  //     float specAngle = max(dot(halfDir, normal), 0.0);
  //     specular = pow(specAngle, 100.0); // 100 -> shininess

  //     fragColor += (albedo + vec3(specular)) * lambertTerm * light.color * vec3(lightIntensity);
  //   }

  //   const vec3 ambientLight = vec3(0.025);
  //   fragColor += albedo * ambientLight;

  //   out_Color = vec4(fragColor, 1.0);
  // }
  `;
}
