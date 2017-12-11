import { mat4, vec4, vec3 } from 'gl-matrix';
import { NUM_LIGHTS } from '../scene';
import TextureBuffer from './textureBuffer';

// Set this equal to NUM_LIGHTS to get correct results in all cases
export const MAX_LIGHTS_PER_CLUSTER = 10;

export default class ClusteredRenderer {
  constructor(xSlices, ySlices, zSlices) {
    this._clusterTexture = new TextureBuffer(xSlices * ySlices * zSlices, MAX_LIGHTS_PER_CLUSTER + 1);
    this._xSlices = xSlices;
    this._ySlices = ySlices;
    this._zSlices = zSlices;
  }

  createPlane(v0, v1, v2) {
    let norm = vec3.create();
    norm = vec3.cross(norm, v1 - v0, v2 - v0);
    norm = vec3.normalize(norm, norm);
    return norm;
  }

  distanceFromPlane(n, p0, v0) {
    return vec3.dot(n, p0 - v0) / vec3.length(n);
  }

  // function for computing adjacent and opposite side lengths for a RIGHT triangle
  computeComponents(dist) {
    let hyp = Math.sqrt(1 / (1 + dist*dist)); 
    return [hyp, dist*hyp]; // [cos,sin] // explaination in notes... todo: put an image in readme..
  }

  updateClustersOptimized(camera, viewMatrix, scene) {
    for (let z = 0; z < this._zSlices; ++z) {
      for (let y = 0; y < this._ySlices; ++y) {
        for (let x = 0; x < this._xSlices; ++x) {
          let i = x + y * this._xSlices + z * this._xSlices * this._ySlices;
          // Reset the light count to 0 for every cluster
          this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)] = 0;
        }
      }
    }

    // LOOP OVER THE LIGHTS
    // FIND THE NDC COORDS
    // DIRECTLY GET THE X AND Y - USE VIEWPROJ MATRIX ??
    // GET Z BASED ON THE DEPTH VALUE OR FROM AN ARRAY FOR EXPONENTIAL - USE VIEW MATRIX ONLY ??
    // LOOP AROUND AND EXPAND THE RANGE BASED ON THE RADIUS
    
    let rad = Math.PI / 180;
    let halfY = Math.tan((camera.fov / 2) * rad);
    let halfX = camera.aspect * halfY;

    let stepY = 2 * halfY / this._ySlices;
    let stepX = 2 * halfX / this._xSlices;
    let stepZ = (camera.far-camera.near) / this._zSlices; // has nothing to do with FOV...
    

    let lRad, lPos, lViewPos = vec4.create();

    // RUN THREE SEPERATE LOOPS FOR X,Y,Z INSTEAD OF NESTED...
    for(let l=0; l<MAX_LIGHTS_PER_CLUSTER; l++) {

      lRad = scene.lights[l].radius;
      lPos = vec4.fromValues(scene.lights[l].position[0], 
                            scene.lights[l].position[1], 
                            scene.lights[l].position[2], 1.0);
      lViewPos = vec4.transformMat4(lViewPos, lPos, viewMatrix);
      lViewPos[2] = -lViewPos[2]; // flip z because it is inverted..

      let xmin = this._xSlices; 
      let ymin = this._ySlices;
      let zmin = this._zSlices;
      let xmax = this._xSlices; 
      let ymax = this._ySlices;
      let zmax = this._zSlices;

      // Z
      for(let i = 0; i < this._zSlices; i++) {
        if (camera.near + i * stepZ > lViewPos[2] - lRad) { // search starts at NCP not origin...
          zmin = i-1;
          break;
        }
      }
      if(zmin >= this._zSlices) {
        continue;
      }

      for(let i = zmin + 1; i < this._zSlices; i++) {
        if (camera.near + i * stepZ > lViewPos[2] + lRad) {
          zmax = i;
          break;
        }
      }
      if(zmax < 0) {
        continue;
      }

      // Y
      for(let i = 0; i < this._ySlices; i++) {
        let nor = this.computeComponents(i * stepY - halfY);
        if (vec3.dot(lViewPos, vec3.fromValues(0, nor[0], -nor[1])) < lRad) {
          ymin = i-1;
          break;
        }
      }
      if(ymin >= this._ySlices) {
        continue;
      }

      // X
      for(let i = ymin + 1; i < this._ySlices; i++) {
        let nor = this.computeComponents(i * stepY - halfY);
        if (vec3.dot(lViewPos, vec3.fromValues(0, nor[0], -nor[1])) > lRad) {
          ymax = i+1;
          break;
        }
      }
      if(ymax < 0) {
        continue;
      }

      for(let i = 0; i < this._xSlices; i++) {
        let nor = this.computeComponents(i * stepX - halfX);
        if (vec3.dot(lViewPos, vec3.fromValues(nor[0], 0, -nor[1])) < lRad) {
          xmin = i-1;
          break;
        }
      }
      if(xmin >= this._xSlices) {
        continue;
      }

      for(let i = xmin + 1; i < this._xSlices; i++) {
        let nor = this.computeComponents(i * stepX - halfX);
        if (vec3.dot(lViewPos, vec3.fromValues(nor[0], 0, -nor[1])) > lRad) {
          xmax = i+1;
          break;
        }
      }
      if(xmax < 0) {
        continue;
      }

      xmin = Math.max(0, xmin);
      ymin = Math.max(0, ymin);
      zmin = Math.max(0, zmin);
      xmax = Math.min(this._xSlices, xmax);
      ymax = Math.min(this._ySlices, ymax);
      zmax = Math.min(this._zSlices, zmax);
      
      for (let z = zmin; z < zmax; z++) {
        for (let y = ymin; y < ymax; y++) {
          for (let x = xmin; x < xmax; x++) {
            let idx = x + y * this._xSlices + z * this._xSlices * this._ySlices;
            let numLights = ++this._clusterTexture.buffer[this._clusterTexture.bufferIndex(idx, 0)];
            if(numLights > MAX_LIGHTS_PER_CLUSTER) {
              this._clusterTexture.buffer[this._clusterTexture.bufferIndex(idx, 0)]--;
              break;
            }
            let texIdx = Math.floor(numLights / 4);
            let offset = numLights - texIdx * 4.0;
            this._clusterTexture.buffer[this._clusterTexture.bufferIndex(idx, texIdx) + offset] = l;
          }
        }
      }
    }

    this._clusterTexture.update();
  }
}
