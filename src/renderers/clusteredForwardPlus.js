import { gl } from '../init';
import { mat4, vec4, vec3 } from 'gl-matrix';
import { loadShaderProgram } from '../utils';
import { NUM_LIGHTS } from '../scene';
import { MAX_LIGHTS_PER_CLUSTER } from './clustered';
import vsSource from '../shaders/clusteredForward.vert.glsl';
import fsSource from '../shaders/clusteredForward.frag.glsl.js';
import TextureBuffer from './textureBuffer';
import ClusteredRenderer from './clustered';

export default class ClusteredForwardPlusRenderer extends ClusteredRenderer {
  constructor(xSlices, ySlices, zSlices) {
    super(xSlices, ySlices, zSlices);

    // Create a texture to store light data
    this._lightTexture = new TextureBuffer(NUM_LIGHTS, 8);
    
    this._shaderProgram = loadShaderProgram(vsSource, fsSource({
      numLights: NUM_LIGHTS,
      maxLights: MAX_LIGHTS_PER_CLUSTER,
      xSlices: xSlices,
      ySlices: ySlices,
      zSlices: zSlices
    }), {
      uniforms: ['u_viewProjectionMatrix', 'u_colmap', 'u_normap', 'u_lightbuffer', 'u_clusterbuffer', 'u_viewMatrix', 'u_screenW', 'u_screenH', 'u_camN', 'u_camF', 'u_camPos'],
      attribs: ['a_position', 'a_normal', 'a_uv']
    });

    this._projectionMatrix = mat4.create();
    this._viewMatrix = mat4.create();
    this._viewProjectionMatrix = mat4.create();
  }

  render(camera, scene) {
    // Update the camera matrices
    camera.updateMatrixWorld();
    mat4.invert(this._viewMatrix, camera.matrixWorld.elements);
    mat4.copy(this._projectionMatrix, camera.projectionMatrix.elements);
    mat4.multiply(this._viewProjectionMatrix, this._projectionMatrix, this._viewMatrix);

    // Update cluster texture which maps from cluster index to light list
    //this.updateClusters(camera, this._viewMatrix, scene);
    this.updateClustersOptimized(camera, this._viewMatrix, scene);
    
    // Update the buffer used to populate the texture packed with light data
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

    // Bind the default null framebuffer which is the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Render to the whole screen
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Clear the frame
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Use this shader program
    gl.useProgram(this._shaderProgram.glShaderProgram);

    // Upload the camera matrix
    gl.uniformMatrix4fv(this._shaderProgram.u_viewProjectionMatrix, false, this._viewProjectionMatrix);

    // Set the light texture as a uniform input to the shader
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this._lightTexture.glTexture);
    gl.uniform1i(this._shaderProgram.u_lightbuffer, 2);

    // Set the cluster texture as a uniform input to the shader
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this._clusterTexture.glTexture);
    gl.uniform1i(this._shaderProgram.u_clusterbuffer, 3);

    // TODO: Bind any other shader inputs
    //this._sceneDim = ivec4.fromValues(canvas.width, canvas.height, camera.near, camera.far);
    gl.uniformMatrix4fv(this._shaderProgram.u_viewMatrix, false, this._viewMatrix);
    gl.uniform1f(this._shaderProgram.u_screenW, canvas.width);
    gl.uniform1f(this._shaderProgram.u_screenH, canvas.height);
    gl.uniform1f(this._shaderProgram.u_camN, camera.near);
    gl.uniform1f(this._shaderProgram.u_camF, camera.far);
    gl.uniform3f(this._shaderProgram.u_camPos, camera.position.x, camera.position.y, camera.position.z);
    // Draw the scene. This function takes the shader program so that the model's textures can be bound to the right inputs
    scene.draw(this._shaderProgram);
  }
};
