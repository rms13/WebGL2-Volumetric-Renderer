import { gl, canvas } from '../init';
import { mat4, vec4, vec3, quat} from 'gl-matrix';
import { loadShaderProgram, renderFullscreenQuad } from '../utils';
import { NUM_LIGHTS } from '../scene';
import { MAX_LIGHTS_PER_CLUSTER } from './clustered';
import toTextureVert from '../shaders/deferredToTexture.vert.glsl';
import toTextureFrag from '../shaders/deferredToTexture.frag.glsl';
import QuadVertSource from '../shaders/quad.vert.glsl';
import fsSource from '../shaders/vol_deferred.frag.glsl.js';
import fsSandboxSource from '../shaders/vol_sandbox_deferred.frag.glsl.js';
import shadowVert from '../shaders/shadow.vert.glsl';
import shadowFrag from '../shaders/shadow.frag.glsl.js';
import VolPassVertSource from '../shaders/vol_pass_deferred.vert.glsl';
import VolPassFragSource from '../shaders/vol_pass_deferred.frag.glsl.js';
import VolSandboxPassFragSource from '../shaders/vol_sandbox_pass_deferred.frag.glsl.js';
import toneMapFrag from '../shaders/toneMap.frag.glsl';
import toneMapVert from '../shaders/toneMap.vert.glsl';
import TextureBuffer from './textureBuffer';
import ClusteredRenderer from './clustered';

export const NUM_GBUFFERS = 3;

const LINEAR = 0;
const NEAREST = 1;

export default class ClusteredDeferredRenderer extends ClusteredRenderer {
  constructor(xSlices, ySlices, zSlices) {
    super(xSlices, ySlices, zSlices);

    this.setupDrawBuffers(canvas.width, canvas.height);
    
    // Create a texture to store light data
    this._lightTexture = new TextureBuffer(NUM_LIGHTS, 8);

    // Create a 3D texture to store volume
    this._upscaleFactor = 32;
    this._heterogenous = true;
    this._interpolationMethod = NEAREST;
    this.createVolumeBuffer(vec3.fromValues(0,-4,0), this._upscaleFactor, this._heterogenous);
    // this.createVolumeBuffer(vec3.fromValues(0,15,0));

    this._progShadowMap = loadShaderProgram(shadowVert, shadowFrag({}), {
      uniforms: [ 'u_viewProjectionMatrix', 
                  'u_colmap', 
                  'u_normap', 
                  'u_viewMatrix'
                ],
      attribs:  [ 'a_position', 
                  'a_normal', 
                  'a_uv'
                ]
    });

    this._progCopy = loadShaderProgram(toTextureVert, toTextureFrag, {
      uniforms: ['u_viewProjectionMatrix', 'u_colmap', 'u_normap', 'u_viewMatrix'],
      attribs:  ['a_position', 'a_normal', 'a_uv']
    });

    this._progVolPass = loadShaderProgram(VolPassVertSource, VolPassFragSource({
      numLights: NUM_LIGHTS,
      maxLights: MAX_LIGHTS_PER_CLUSTER,
      numGBuffers: NUM_GBUFFERS,
      xSlices: xSlices, ySlices: ySlices, zSlices: zSlices,
    }), {
      uniforms: [ 'u_gbuffers[0]', 
                  'u_gbuffers[1]', 
                  'u_gbuffers[2]', 
                  'u_lightbuffer', 
                  'u_clusterbuffer', 
                  'u_viewMatrix', 
                  'u_invViewMatrix', 
                  'u_screenW', 
                  'u_screenH', 
                  'u_camN', 
                  'u_camF', 
                  'u_camPos',
                  'u_volBuffer', 
                  'u_time', 
                  'u_volSize', 
                  'u_volTransMat', 
                  'u_invVolTransMat', 
                  'u_invTranspVolTransMat',
                  'u_viewProjectionMatrix',
                  'u_lightViewProjectionMatrix',
                  'u_shadowMap',
                  'u_density',
                  'u_dirLightCol'
                ],
      attribs:  ['a_position']
    });

    this._progVolSandboxPass = loadShaderProgram(VolPassVertSource, VolSandboxPassFragSource({
      numLights: NUM_LIGHTS,
      maxLights: MAX_LIGHTS_PER_CLUSTER,
      numGBuffers: NUM_GBUFFERS,
      xSlices: xSlices, ySlices: ySlices, zSlices: zSlices,
    }), {
      uniforms: [ 'u_gbuffers[0]', 
                  'u_gbuffers[1]', 
                  'u_gbuffers[2]', 
                  'u_lightbuffer', 
                  'u_clusterbuffer', 
                  'u_viewMatrix', 
                  'u_invViewMatrix', 
                  'u_screenW', 
                  'u_screenH', 
                  'u_camN', 
                  'u_camF', 
                  'u_camPos',
                  'u_volBuffer', 
                  'u_time', 
                  'u_volSize', 
                  'u_volTransMat', 
                  'u_invVolTransMat', 
                  'u_invTranspVolTransMat',
                  'u_viewProjectionMatrix',
                  'u_lightViewProjectionMatrix',
                  'u_shadowMap',
                  'u_light1Col',
                  'u_light1Intensity',
                  'u_light1PosY',
                  'u_light1PosZ',
                  'u_light2Col',
                  'u_light2Intensity',
                  'u_light2PosX',
                  'u_light2PosZ',
                  'u_debugVolume',
                  'u_density',
                  'u_dirLightCol'
                ],
      attribs:  ['a_position']
    });

    this._progShade = loadShaderProgram(QuadVertSource, fsSource({
      numLights: NUM_LIGHTS,
      maxLights: MAX_LIGHTS_PER_CLUSTER,
      numGBuffers: NUM_GBUFFERS,
      xSlices: xSlices, ySlices: ySlices, zSlices: zSlices,
    }), {
      uniforms: [ 'u_gbuffers[0]', 
                  'u_gbuffers[1]', 
                  'u_gbuffers[2]', 
                  'u_lightbuffer', 
                  'u_clusterbuffer', 
                  'u_viewMatrix', 
                  'u_invViewMatrix', 
                  'u_screenW', 
                  'u_screenH', 
                  'u_camN', 
                  'u_camF', 
                  'u_camPos',
                  'u_time', 
                  'u_volBuffer', 
                  'u_volSize', 
                  'u_volTransMat', 
                  'u_invVolTransMat', 
                  'u_invTranspVolTransMat',
                  'u_volPassBuffer',
                  'u_shadowMap',
                  'u_lightViewProjectionMatrix',
                  'u_viewProjectionMatrix',
                  'u_upscaleFactor',
                  'u_debugVolume',
                  'u_debugShadow',
                  'u_dirLightCol'
                ],
      attribs:  [ 'a_position'  ]
    });

    this._progSandboxShade = loadShaderProgram(QuadVertSource, fsSandboxSource({
      numLights: NUM_LIGHTS,
      maxLights: MAX_LIGHTS_PER_CLUSTER,
      numGBuffers: NUM_GBUFFERS,
      xSlices: xSlices, ySlices: ySlices, zSlices: zSlices,
    }), {
      uniforms: [ 'u_gbuffers[0]', 
                  'u_gbuffers[1]', 
                  'u_gbuffers[2]', 
                  'u_lightbuffer', 
                  'u_clusterbuffer', 
                  'u_viewMatrix', 
                  'u_invViewMatrix', 
                  'u_screenW', 
                  'u_screenH', 
                  'u_camN', 
                  'u_camF', 
                  'u_camPos',
                  'u_time', 
                  'u_volBuffer', 
                  'u_volSize', 
                  'u_volTransMat', 
                  'u_invVolTransMat', 
                  'u_invTranspVolTransMat',
                  'u_volPassBuffer',
                  'u_shadowMap',
                  'u_lightViewProjectionMatrix',
                  'u_viewProjectionMatrix',
                  'u_upscaleFactor',
                  'u_debugVolume',
                  'u_debugShadow',
                  'u_dirLightCol'
                ],
      attribs:  [ 'a_position'  ]
    });

    this._progToneMap = loadShaderProgram(toneMapVert, toneMapFrag, {
      uniforms: ['u_HDRTexture', 'u_toneMapType', 'u_exposure'],
      attribs:  ['a_position', 'a_uv']
    });

    this._projectionMatrix          = mat4.create();
    this._viewMatrix                = mat4.create();
    this._invViewMatrix             = mat4.create();
    this._viewProjectionMatrix      = mat4.create();
    this._invViewProjectionMatrix   = mat4.create();

    // View Projection for the Light
    this._lightViewProjectionMatrix   = mat4.create();
    this._lightProjectionMatrix       = mat4.create();
    this._lightViewMatrix             = mat4.create();
    mat4.ortho(this._lightProjectionMatrix, -20, 20, -20, 20, -20.0, 20);
    mat4.lookAt(this._lightViewMatrix, vec3.fromValues(.5,4,.5), vec3.fromValues(0,0,0), vec3.fromValues(0,1,0));
    mat4.multiply(this._lightViewProjectionMatrix, this._lightProjectionMatrix, this._lightViewMatrix);

    this.first = true;
    this.renVol = true;
  }

  setupDrawBuffers(width, height) {
    this._width = width;
    this._height = height;
    
    this._fboShadowMapPass = gl.createFramebuffer();
    var w = 1024;
    var h = 1024;
    //Create, bind, and store a depth target texture for the FBO
    this._shadowDepthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._shadowDepthTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16/*gl.DEPTH_COMPONENT*/, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboShadowMapPass);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this._shadowDepthTex, 0);

    // Shadow Map
    this._shadowMapTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._shadowMapTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboShadowMapPass);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._shadowMapTexture, 0);  
    
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      throw "Framebuffer incomplete";
    }
 
    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0
    ]);

    this._fbo = gl.createFramebuffer();    

    //Create, bind, and store a depth target texture for the FBO
    this._depthTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._depthTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16/*gl.DEPTH_COMPONENT*/, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this._depthTex, 0);

    // Create, bind, and store "color" target textures for the FBO
    this._gbuffers = new Array(NUM_GBUFFERS);

    this._gbuffers[0] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[0]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._gbuffers[0], 0);

    this._gbuffers[1] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[1]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this._gbuffers[1], 0);

    this._gbuffers[2] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[2]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this._gbuffers[2], 0);

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      throw "Framebuffer incomplete";
    }

    gl.drawBuffers([
      gl.COLOR_ATTACHMENT0,
      gl.COLOR_ATTACHMENT1,
      gl.COLOR_ATTACHMENT2
    ]);

    // Volume Pass..
    this._volPassTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._volPassTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.w = (width % 8);
    this.w += width;
    this.h = (height % 8);
    this.h += height;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.w, this.h, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    this._fboVolPass = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboVolPass);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._volPassTex, 0);
    
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      throw "Framebuffer incomplete";
    }

    // final pass texture to tonemap..

    this._finalTexHDR = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._finalTexHDR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this._fboFinalPassHDR = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboFinalPassHDR);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._finalTexHDR, 0);

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      throw "Framebuffer incomplete";
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  createVolumeBuffer(pos, upscaleFactor, heterogenous) {
    // CREATE AND BING THE 3D-TEXTURE
    // reference: http://www.realtimerendering.com/blog/webgl-2-new-features/
    this.SIZE = 64;
    var max = this.SIZE + this.SIZE*this.SIZE + this.SIZE*this.SIZE*this.SIZE;
    this.data = new Uint8Array(this.SIZE * this.SIZE * this.SIZE);
    for (var k = 0; k < this.SIZE; ++k) {
      for (var j = 0; j < this.SIZE; ++j) {
        for (var i = 0; i < this.SIZE; ++i) {
          let density = 255.0 * Math.random();
          this.data[i + j * this.SIZE + k * this.SIZE * this.SIZE] = density;//(i + j * this.SIZE + k * this.SIZE * this.SIZE) / max * 255.0;//Math.random() * 255.0; // snoise([i, j, k]) * 256;
        }
      }
    }

    var volPos = pos; // position of the volume
    var volScale = vec3.fromValues(1,1,1); // scale of the volume
    var volOrient = quat.create();
    quat.fromEuler(volOrient, 0.0, 0.0, 0.0);

    this.volTransMat = mat4.create();
    mat4.fromRotationTranslationScale(this.volTransMat, volOrient, volPos, volScale);
    this.invVolTransMat = mat4.create();
    mat4.invert(this.invVolTransMat, this.volTransMat);    
    this.invTranspVolTransMat = mat4.create();
    mat4.transpose(this.invTranspVolTransMat, this.invVolTransMat);

    this._volBuffer = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, Math.log2(this.SIZE));
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, this.SIZE, this.SIZE, this.SIZE,
      0, gl.RED, gl.UNSIGNED_BYTE, this.data
    );
    gl.generateMipmap(gl.TEXTURE_3D);
    gl.bindTexture(gl.TEXTURE_3D, null);
    // END: CREATE 3D-TEXTURE
  }

  resize(width, height) {
    this._width = width;
    this._height = height;

    gl.bindTexture(gl.TEXTURE_2D, this._depthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    
    for (let i = 0; i < NUM_GBUFFERS; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    }
    
    // Shadow Map
    gl.bindTexture(gl.TEXTURE_2D, this._shadowDepthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT16, 1024, 1024, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    gl.bindTexture(gl.TEXTURE_2D, this._shadowMapTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1024, 1024, 0, gl.RGBA, gl.FLOAT, null);

    // volume pass..
    gl.bindTexture(gl.TEXTURE_2D, this._volPassTex);
    this.w = (width % 8);
    this.w += width;
    this.h = (height % 8);
    this.h += height;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.w/2, this.h/2, 0, gl.RGBA, gl.FLOAT, null);

    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  render(camera, scene, 
        debugVolume, debugShadow,
        sandboxMode, 
        light1Col, light1Intensity, light1PosY, light1PosZ,
        light2Col, light2Intensity, light2PosX, light2PosZ,
        volPosX, volPosY, volPosZ,
        volScaleX, volScaleY, volScaleZ,
        upscaleFactor, heterogenous, scattering, absorption, density, interpolation, 
        altFrame, toneMapType, exposure,
        dirLightX, dirLightZ, dirLightCol)
  {
    if (canvas.width != this._width || canvas.height != this._height) {
      this.resize(canvas.width, canvas.height);
    }

    // Update the camera matrices
    camera.updateMatrixWorld();
    mat4.invert(this._viewMatrix, camera.matrixWorld.elements);
    mat4.copy(this._projectionMatrix, camera.projectionMatrix.elements);
    mat4.multiply(this._viewProjectionMatrix, this._projectionMatrix, this._viewMatrix);
    mat4.invert(this._invViewMatrix, this._viewMatrix);
    mat4.invert(this._invViewProjectionMatrix, this._viewProjectionMatrix);

    //--------------------------------------------------  
    // Shadow
    //--------------------------------------------------  

    mat4.ortho(this._lightProjectionMatrix, -20, 20, -20, 20, -20.0, 20);
    mat4.lookAt(this._lightViewMatrix, vec3.fromValues(dirLightX, 4.0, dirLightZ), vec3.fromValues(0,0,0), vec3.fromValues(0,1,0));
    mat4.multiply(this._lightViewProjectionMatrix, this._lightProjectionMatrix, this._lightViewMatrix);

    // Render to the whole screen
    gl.viewport(0, 0, 1024, 1024);
    // Bind the framebuffer
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboShadowMapPass);
    // Clear the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Use this shader program
    gl.useProgram(this._progShadowMap.glShaderProgram);
    // Bind any uniform variables
    gl.uniformMatrix4fv(this._progShadowMap.u_viewProjectionMatrix, false, this._lightViewProjectionMatrix);
    gl.uniform1i(this._progShadowMap.u_debugShadow, debugShadow);

    scene.draw(this._progShadowMap);


    //--------------------------------------------------  
    // Create texture to hold g-buffers
    //--------------------------------------------------              
    // Render to the whole screen
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Bind the framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    // Clear the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Use the shader program to copy to the draw buffers
    gl.useProgram(this._progCopy.glShaderProgram);
    // Upload the camera matrix
    gl.uniformMatrix4fv(this._progCopy.u_viewProjectionMatrix, false, this._viewProjectionMatrix);
    // view matrix
    gl.uniformMatrix4fv(this._progCopy.u_viewMatrix, false, this._viewMatrix);
    // Draw the scene. This function takes the shader program so that the model's textures can be bound to the right inputs
    scene.draw(this._progCopy);


    for (let i = 0; i < NUM_LIGHTS; ++i) {
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 0] = scene.lights[i].position[0];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 1] = scene.lights[i].position[1];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 2] = scene.lights[i].position[2];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 0) + 3] = scene.lights[i].radius;

      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 0] = scene.lights[i].color[0];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 1] = scene.lights[i].color[1];
      this._lightTexture.buffer[this._lightTexture.bufferIndex(i, 1) + 2] = scene.lights[i].color[2];
    }
    // Update the light texture
    this._lightTexture.update();

    // Update the clusters for the frame
    this.updateClustersOptimized(camera, this._viewMatrix, scene);

    var volShaderProgram, finalShaderProgram;
    if(!sandboxMode) {
      volShaderProgram = this._progVolPass;
      finalShaderProgram = this._progShade;
    }
    else {
      volShaderProgram = this._progVolSandboxPass;
      finalShaderProgram = this._progSandboxShade;
    }

    if(this._interpolationMethod != interpolation) {
      this.updateVolume2D(interpolation, canvas.width, canvas.height);
      this._interpolationMethod = interpolation;
    }

    if(this.framenum === undefined) this.framenum = 0.0;
    this.framenum+=0.05;

    if(altFrame === 0) {
      this.renVol = true;
    }
    else {
      this.renVol != this.renVol;
    }

    if(this.renVol === true) {
      this.renderVolumePass(volShaderProgram, debugVolume, debugShadow, camera, light1Col, light1Intensity, light1PosY, light1PosZ,
        light2Col, light2Intensity, light2PosX, light2PosZ,
        volPosX, volPosY, volPosZ,
        volScaleX, volScaleY, volScaleZ,
        upscaleFactor, heterogenous, scattering, absorption, density, dirLightCol);
    }
    
    this.renderFinalPass(finalShaderProgram, debugVolume, debugShadow, camera, light1Col, light1Intensity, light1PosY, light1PosZ,
      light2Col, light2Intensity, light2PosX, light2PosZ,
      volPosX, volPosY, volPosZ,
      volScaleX, volScaleY, volScaleZ,
      upscaleFactor, heterogenous, scattering, absorption, dirLightCol);

    this.toneMapPass(this._progToneMap, toneMapType, exposure);
  }

  updateVolume(upscaleFactor, heterogenous, pos, scale, orient)
  {
    gl.deleteTexture(this._volBuffer);
    // CREATE AND BIND THE 3D-TEXTURE
    // reference: http://www.realtimerendering.com/blog/webgl-2-new-features/
    this.SIZE = 64;
    var max = this.SIZE + this.SIZE*this.SIZE + this.SIZE*this.SIZE*this.SIZE;
    this.data = new Uint8Array(this.SIZE * this.SIZE * this.SIZE);
    for (var k = 0; k < this.SIZE; ++k) {
      for (var j = 0; j < this.SIZE; ++j) {
        for (var i = 0; i < this.SIZE; ++i) {
          let density = 255.0;
          if(heterogenous) {
            density *= Math.random();
          }
          this.data[i + j * this.SIZE + k * this.SIZE * this.SIZE] = density;
        }
      }
    }

    var volPos = pos; // position of the volume
    var volScale = vec3.fromValues(1,1,1); // scale of the volume
    var volOrient = quat.create();
    quat.fromEuler(volOrient, 0.0, 0.0, 0.0);

    this.volTransMat = mat4.create();
    mat4.fromRotationTranslationScale(this.volTransMat, volOrient, volPos, volScale);
    this.invVolTransMat = mat4.create();
    mat4.invert(this.invVolTransMat, this.volTransMat);    
    this.invTranspVolTransMat = mat4.create();
    mat4.transpose(this.invTranspVolTransMat, this.invVolTransMat);

    this._volBuffer = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_BASE_LEVEL, 0);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAX_LEVEL, Math.log2(this.SIZE));
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, this.SIZE, this.SIZE, this.SIZE,
      0, gl.RED, gl.UNSIGNED_BYTE, this.data
    );
    gl.generateMipmap(gl.TEXTURE_3D);
    gl.bindTexture(gl.TEXTURE_3D, null);
    // END: CREATE 3D-TEXTURE
  }

  renderVolumePass(shaderProgram, debugVolume, debugShadow, camera, light1Col, light1Intensity, light1PosY, light1PosZ,
    light2Col, light2Intensity, light2PosX, light2PosZ,
    volPosX, volPosY, volPosZ,
    volScaleX, volScaleY, volScaleZ,
    upscaleFactor, heterogenous, scattering, absorption, density, dirLightCol)
  {
    // Update Volume Properties
    var volPos    = vec3.fromValues(volPosX, volPosY, volPosZ); // position of the volume
    var volScale  = vec3.fromValues(volScaleX, volScaleY, volScaleZ); // scale of the volume
    var volOrient = quat.create();
    quat.fromEuler(volOrient, 0.0, 0.0, 0.0);

    mat4.fromRotationTranslationScale(this.volTransMat, volOrient, volPos, volScale);
    mat4.invert(this.invVolTransMat, this.volTransMat);    
    mat4.transpose(this.invTranspVolTransMat, this.invVolTransMat);

    if(this._upscaleFactor != upscaleFactor || this._heterogenous != heterogenous) {
      this.updateVolume(upscaleFactor, heterogenous, volPos, volScale, volOrient);
      this._upscaleFactor = upscaleFactor;  
      this._heterogenous = heterogenous;
    }

    //--------------------------------------------------  
    // Volume Pass
    //--------------------------------------------------              
    gl.viewport(0, 0, canvas.width/Math.sqrt(upscaleFactor), canvas.height/Math.sqrt(upscaleFactor));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboVolPass);
    // Clear the frame
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Use this shader program
    gl.useProgram(shaderProgram.glShaderProgram);

    // TODO: Bind any other shader inputs
    gl.uniformMatrix4fv(shaderProgram.u_viewProjectionMatrix, false, this._viewProjectionMatrix);
    gl.uniformMatrix4fv(shaderProgram.u_lightViewProjectionMatrix, false, this._lightViewProjectionMatrix);
    gl.uniformMatrix4fv(shaderProgram.u_viewMatrix, false, this._viewMatrix);
    gl.uniformMatrix4fv(shaderProgram.u_invViewMatrix, false, this._invViewMatrix);    
    gl.uniform1f(shaderProgram.u_screenW, canvas.width / Math.sqrt(upscaleFactor));
    gl.uniform1f(shaderProgram.u_screenH, canvas.height / Math.sqrt(upscaleFactor));
    gl.uniform1f(shaderProgram.u_camN, camera.near);
    gl.uniform1f(shaderProgram.u_camF, camera.far);
    gl.uniform3f(shaderProgram.u_camPos, camera.position.x, camera.position.y, camera.position.z);
    gl.uniform1i(shaderProgram.u_debugVolume, debugVolume);
    gl.uniform1i(shaderProgram.u_debugShadow, debugShadow);
    gl.uniform1f(shaderProgram.u_density, density);
    gl.uniform3f(shaderProgram.u_dirLightCol, dirLightCol[0] / 255, dirLightCol[1] / 255, dirLightCol[2] / 255);
    
    gl.uniform3f(shaderProgram.u_light1Col, light1Col[0], light1Col[1], light1Col[2]);
    gl.uniform1f(shaderProgram.u_light1Intensity, light1Intensity);
    gl.uniform1f(shaderProgram.u_light1PosY, light1PosY);
    gl.uniform1f(shaderProgram.u_light1PosZ, light1PosZ);

    gl.uniform3f(shaderProgram.u_light2Col, light2Col[0], light2Col[1], light2Col[2]);
    gl.uniform1f(shaderProgram.u_light2Intensity, light2Intensity);
    gl.uniform1f(shaderProgram.u_light2PosX, light2PosX);
    gl.uniform1f(shaderProgram.u_light2PosZ, light2PosZ);
    
    gl.uniform1f(shaderProgram.u_volSize, this.SIZE);
    gl.uniformMatrix4fv(shaderProgram.u_volTransMat, false, this.volTransMat);
    gl.uniformMatrix4fv(shaderProgram.u_viewProjectionMatrix, false, this._viewProjectionMatrix);
    gl.uniformMatrix4fv(shaderProgram.u_lightViewProjectionMatrix, false, this._lightViewProjectionMatrix);

    gl.uniform1f(shaderProgram.u_time, this.framenum);

    // Bind g-buffers
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[0]);
    gl.uniform1i(shaderProgram[`u_gbuffers[0]`], 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[1]);
    gl.uniform1i(shaderProgram[`u_gbuffers[1]`], 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[2]);
    gl.uniform1i(shaderProgram[`u_gbuffers[2]`], 2);

    // Bind the light and cluster textures...
    // Set the light texture as a uniform input to the shader
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this._lightTexture.glTexture);
    gl.uniform1i(shaderProgram.u_lightbuffer, 3);

    // Set the cluster texture as a uniform input to the shader
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this._clusterTexture.glTexture);
    gl.uniform1i(shaderProgram.u_clusterbuffer, 4);

    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
    gl.uniform1i(shaderProgram.u_volBuffer, 5);

    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this._shadowMapTexture);
    gl.uniform1i(shaderProgram[`u_shadowMap`], 6);

    renderFullscreenQuad(shaderProgram);
    //scene.draw(this._progVolPass);
  }

  renderFinalPass(shaderProgram, debugVolume, debugShadow, camera, light1Col, light1Intensity, light1PosY, light1PosZ,
    light2Col, light2Intensity, light2PosX, light2PosZ,
    volPosX, volPosY, volPosZ,
    volScaleX, volScaleY, volScaleZ,
    upscaleFactor, heterogenous, scattering, absorption, dirLightCol)
  {
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Bind the default null framebuffer which is the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboFinalPassHDR);
    // Clear the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Use this shader program
    gl.useProgram(shaderProgram.glShaderProgram);

    // TODO: Bind any other shader inputs
    gl.uniformMatrix4fv(shaderProgram.u_viewMatrix, false, this._viewMatrix);
    gl.uniformMatrix4fv(shaderProgram.u_invViewMatrix, false, this._invViewMatrix);
    gl.uniform1f(shaderProgram.u_screenW, canvas.width);
    gl.uniform1f(shaderProgram.u_screenH, canvas.height);
    gl.uniform1f(shaderProgram.u_camN, camera.near);
    gl.uniform1f(shaderProgram.u_camF, camera.far);
    gl.uniform3f(shaderProgram.u_camPos, camera.position.x, camera.position.y, camera.position.z);
    gl.uniform3f(shaderProgram.u_dirLightCol, dirLightCol[0] / 255, dirLightCol[1] / 255, dirLightCol[2] / 255);
    gl.uniformMatrix4fv(shaderProgram.u_viewProjectionMatrix, false, this._viewProjectionMatrix);
    gl.uniformMatrix4fv(shaderProgram.u_lightViewProjectionMatrix, false, this._lightViewProjectionMatrix);
    gl.uniform1i(shaderProgram.u_debugVolume, debugVolume);
    gl.uniform1i(shaderProgram.u_debugShadow, debugShadow);
    
    gl.uniform1f(shaderProgram.u_volSize, this.SIZE);
    gl.uniform1f(shaderProgram.u_upscaleFactor, 1 / Math.sqrt(upscaleFactor));
    gl.uniformMatrix4fv(shaderProgram.u_volTransMat, false, this.volTransMat);
    gl.uniformMatrix4fv(shaderProgram.u_invVolTransMat, false, this.invVolTransMat);
    gl.uniformMatrix4fv(shaderProgram.u_invTranspVolTransMat, false, this.invTranspVolTransMat);

    gl.uniform1f(shaderProgram.u_time, this.framenum);

    // Bind g-buffers
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[0]);
    gl.uniform1i(shaderProgram[`u_gbuffers[0]`], 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[1]);
    gl.uniform1i(shaderProgram[`u_gbuffers[1]`], 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._gbuffers[2]);
    gl.uniform1i(shaderProgram[`u_gbuffers[2]`], 2);

    // bind volume pass texture
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this._volPassTex);
    gl.uniform1i(shaderProgram[`u_volPassBuffer`], 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this._shadowMapTexture);
    gl.uniform1i(shaderProgram[`u_shadowMap`], 4);

    // Bind the light and cluster textures...
    // Set the light texture as a uniform input to the shader
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this._lightTexture.glTexture);
    gl.uniform1i(shaderProgram.u_lightbuffer, 5);

    // Set the cluster texture as a uniform input to the shader
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this._clusterTexture.glTexture);
    gl.uniform1i(shaderProgram.u_clusterbuffer, 6);

    // bind 3d volume texture
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_3D, this._volBuffer);
    gl.uniform1i(shaderProgram.u_volBuffer, 7);

    renderFullscreenQuad(shaderProgram); 
  }

  updateVolume2D(interpolation, width, height)
  {
    // Volume Pass..
    this._volPassTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._volPassTex);
    var interpolationMethod;
    if(interpolation == LINEAR) {
      interpolationMethod = gl.LINEAR;
    }
    else if(interpolation == NEAREST) {
      interpolationMethod = gl.NEAREST;
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, interpolationMethod);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, interpolationMethod);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.w = (width % 8);
    this.w += width;
    this.h = (height % 8);
    this.h += height;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.w, this.h, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    this._fboVolPass = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fboVolPass);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._volPassTex, 0);
    
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      throw "Framebuffer incomplete";
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  toneMapPass(shaderProgram, toneMapType, exposure)
  {
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Bind the default null framebuffer which is the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Clear the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Use this shader program
    gl.useProgram(shaderProgram.glShaderProgram);
    
    gl.uniform1i(shaderProgram.u_toneMapType, toneMapType);
    gl.uniform1f(shaderProgram.u_exposure, exposure);

    // bind volume pass texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._finalTexHDR);
    gl.uniform1i(shaderProgram[`u_HDRTexture`], 0);

    renderFullscreenQuad(shaderProgram); 
  }
};
