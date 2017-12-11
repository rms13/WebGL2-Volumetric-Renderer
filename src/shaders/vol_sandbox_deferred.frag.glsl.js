export default function(params) {
  return `#version 300 es
  precision highp float;
  precision highp sampler3D;

  #define USEPASS 1

  uniform sampler2D u_lightbuffer;
  
  uniform sampler2D u_gbuffers[${params.numGBuffers}];

  uniform sampler2D u_volPassBuffer;
  uniform sampler2D u_shadowMap;

  uniform sampler3D u_volBuffer;
  
  in vec4 v_pos;
  in vec4 v_lightPosition;
  in vec2 v_uv;

  uniform sampler2D u_clusterbuffer;

  uniform mat4 u_viewMatrix;
  uniform mat4 u_invViewMatrix;
  uniform mat4 u_viewProjectionMatrix;
  uniform mat4 u_viewProjectionMatrixLight;
  uniform mat4 u_lightViewProjectionMatrix;
  
  uniform int u_debugVolume;
  uniform int u_debugShadow;
  uniform vec3 u_dirLightCol;
  
  uniform float u_upscaleFactor;

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
  
  float shadowMap(vec3 pos, vec3 nor, vec3 col)
  {
    vec4 position       = u_viewProjectionMatrix * vec4(pos, 1.0);
    vec4 lightPosition  = u_lightViewProjectionMatrix * vec4(pos, 1.0);
    // Remove some shadow acne
    lightPosition.z -= 0.007;

    // Get the light direction from the point to the light
    vec4 lightDir     = normalize(vec4(0.0,0.0,0.0,1.0) - lightPosition);
    // vec4 lightDir     = normalize(position - lightPosition);
    vec3 shadowCoord  = (lightPosition.xyz / lightPosition.w) / 2.0 + 0.5;

    vec3 sunCol       = vec3(0.5, 0.5, 0.4);
    vec4 rgbaDepth    = texture(u_shadowMap, shadowCoord.xy);
    float depth       = rgbaDepth.r; // Retrieve the z-value from R
    float visibility  = (shadowCoord.z > depth + 0.005)? 0.1 : 1.0;
    // out_Color = vec4(shadowCoord, 1.0);
    float dotprod     = dot(lightDir.xyz, nor);
    vec3 albedo       = col * u_dirLightCol * max(dotprod, 0.05);
    // out_Color      = vec4(albedo * visibility, 1.0);    

    // return albedo * visibility;
    return visibility;
  }

  vec3 debugShadowMap(vec3 pos, vec3 nor, vec3 col)
  {
    vec4 position       = u_viewProjectionMatrix * vec4(pos, 1.0);
    vec4 lightPosition  = u_lightViewProjectionMatrix * vec4(pos, 1.0);
    // Remove some shadow acne
    lightPosition.z -= 0.007;

    // Get the light direction from the point to the light
    vec4 lightDir     = normalize(vec4(0.0,0.0,0.0,1.0) - lightPosition);
    // vec4 lightDir     = normalize(position - lightPosition);
    vec3 shadowCoord  = (lightPosition.xyz / lightPosition.w) / 2.0 + 0.5;

    vec3 sunCol       = vec3(0.5, 0.5, 0.4);
    vec4 rgbaDepth    = texture(u_shadowMap, shadowCoord.xy);
    float depth       = rgbaDepth.r; // Retrieve the z-value from R
    float visibility  = (shadowCoord.z > depth + 0.005)? 0.1 : 1.0;
    // out_Color = vec4(shadowCoord, 1.0);
    float dotprod     = dot(lightDir.xyz, nor);
    vec3 albedo       = col * u_dirLightCol * max(dotprod, 0.05);

    return albedo * visibility;
  }

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
    // Get position, color, and normal information from G-Buffer
    vec3 v_position = texture(u_gbuffers[0], v_uv).xyz;
    vec3 albedo     = texture(u_gbuffers[1], v_uv).xyz;
    vec3 normal     = texture(u_gbuffers[2], v_uv).xyz;
    float shadow     = shadowMap(v_position, normal, albedo);

    vec4 lightPosition = u_lightViewProjectionMatrix * vec4(v_position, 1.0);

    vec3 fragColor = vec3(0.0, 0.0, 0.0);
      
    // // Point light
    // vec3 lightPos = vec3(0.0, 2.0 * 1.0 * sin(u_time * 0.5) + 8.0, 0.0);
    // // vec3 lightPos = vec3(0.0, 8.0, 0.0);
    // vec3 lightCol = vec3(0.9, 0.8, 0.4);


    // READ LIGHTS FROM CLUSTERS AND EVALUATE LIGHTING..
    
    ivec3 clusterPos = ivec3(
      int(gl_FragCoord.x / u_screenW * float(${params.xSlices})),
      int(gl_FragCoord.y / u_screenH * float(${params.ySlices})),
      int((-(u_viewMatrix * vec4(v_position,1.0)).z - u_camN) / (u_camF - u_camN) * float(${params.zSlices}))
    );

    int clusterIdx = clusterPos.x + clusterPos.y * ${params.xSlices} + clusterPos.z * ${params.xSlices} * ${params.ySlices};
    int clusterWidth = ${params.xSlices} * ${params.ySlices} * ${params.zSlices};
    int clusterHeight = int(float(${params.maxLights}+1) / 4.0) + 1;
    float clusterU = float(clusterIdx + 1) / float(clusterWidth + 1); // like u in UnpackLight()..

    int numLights = int(texture(u_clusterbuffer, vec2(clusterU, 0.0)).x); // clamp to max lights in scene if this misbehaves..

    // DIRECTIONAL LIGHT - SUN
    vec3 sunDir = normalize(vec3(1.0, 0.5, 1.0));
    vec3 sunCol = 0.1 * vec3(0.5, 0.5, 0.4);
    fragColor += albedo * u_dirLightCol * max(dot(sunDir, normal), 0.05);

  #define USESHADOW 
  #ifdef USESHADOW
    fragColor *= shadow;//* volumetricShadow(v_position, lightPosition);      
  #endif

    //vec3 scat = vec3(0.0);// = muS * Li * phaseFunction();

    // for (int j = 0; j < ${params.numLights}; j++) {
    //   if(j >= numLights) {
    //     break;
    //   }

    //   int clusterPixel = int(float(j+1) / 4.0);
    //   float clusterV = float(clusterPixel+1) / float(clusterHeight+1);
    //   vec4 texel = texture(u_clusterbuffer, vec2(clusterU, clusterV));
    //   int lightIdx;
    //   int clusterPixelComponent = (j+1) - (clusterPixel * 4);
    //   if (clusterPixelComponent == 0) {
    //       lightIdx = int(texel[0]);
    //   } else if (clusterPixelComponent == 1) {
    //       lightIdx = int(texel[1]);
    //   } else if (clusterPixelComponent == 2) {
    //       lightIdx = int(texel[2]);
    //   } else if (clusterPixelComponent == 3) {
    //       lightIdx = int(texel[3]);
    //   }

    //   // shading
    //   Light light = UnpackLight(lightIdx);
    //   float lightDistance = distance(light.position, v_position);
    //   vec3 L = (light.position - v_position) / lightDistance;

    //   float lightIntensity = cubicGaussian(2.0 * lightDistance / light.radius);
    //   float lambertTerm = max(dot(L, normal), 0.0);

    //   float specular = 0.0;
    //   // blinn-phong shading... https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_shading_model
    //   vec3 viewDir = normalize(u_camPos - v_position);
    //   vec3 halfDir = normalize(L + viewDir);
    //   float specAngle = max(dot(halfDir, normal), 0.0);
    //   specular = pow(specAngle, 100.0); // 100 -> shininess

    //   fragColor += (albedo + vec3(specular)) * lambertTerm * light.color * vec3(lightIntensity);

    //   // vec3 L = (u_volTransMat * vec4((light.position - v_position), 1.0)).xyz;
    //   // float distL = length(L);
    //   // vec3 lightDir = L / (distL);
    //   // vec3 normalVol = (u_volTransMat * vec4(normal, 0.0)).xyz;
    //   // vec3 Li = max(0.0, dot(normalVol, lightDir)) * light.color / (distL * distL);

    //   //fragColor += (albedo / PI) * Li;
    // }
    // ..READ LIGHTS FROM CLUSTERS AND EVALUATE LIGHTING

#define VOLUME
#ifdef VOLUME
    vec4 volTexSample00 = texture(u_volPassBuffer, v_uv * u_upscaleFactor);
    fragColor *= volTexSample00.w;
    fragColor += volTexSample00.xyz;
#endif

    // Gamma Correction
    // fragColor = pow(fragColor, vec3(1.0 / 2.2));

    //fragColor = vec3(float(clusterPos.z)/16.0);
    out_Color = vec4(fragColor.xyz, 1.0);

    // DEBUG VIEWS
    if(u_debugVolume == 1) {
      out_Color = vec4(volTexSample00.xyz, 1.0);
    }

    if(u_debugShadow == 1) {
      out_Color = vec4(debugShadowMap(v_position, normal, albedo), 1.0);
    }

    if(u_debugShadow == 1 && u_debugVolume == 1) {
      out_Color = vec4(debugShadowMap(v_position, normal, albedo), 1.0) + vec4(volTexSample00.xyz, 1.0);
    }
  }
  `;
}
