import { makeRenderLoop, camera, cameraControls, gui, sandboxGUI, gl, DEBUG } from './init';
import ForwardRenderer from './renderers/forward';
import ClusteredForwardPlusRenderer from './renderers/clusteredForwardPlus';
import ClusteredDeferredRenderer from './renderers/clusteredDeferred';
import Scene from './scene';

const FORWARD = 'Forward';
const CLUSTERED_FORWARD_PLUS = 'Clustered Forward+';
const CLUSTERED_DEFFERED = 'Clustered Deferred';

const params = {
  renderer: CLUSTERED_DEFFERED,
  _renderer: null,

  SandboxMode: false,

  Light1Color: [ 0, 128, 255 ],
  Light1Intensity: 1,
  Light1PosY: 0.0,
  Light1PosZ: 0.0,

  Light2Color: [ 1, 0, 0 ],
  Light2Intensity: 1,
  Light2PosX: 0.0,
  Light2PosZ: 0.0,

  VolumePosX: 0,
  VolumePosY: -4,
  VolumePosZ: 0,

  VolumeScaleX: 1,
  VolumeScaleY: 1,
  VolumeScaleZ: 1,

  Heterogenous: true,
  Scattering: 0.05,
  Absorption: 0.05,
  Density: 0.25,
  UpscaleFactor: 4,
  Interpolation: 0,
  DirLightPosX: 0.5,
  DirLightPosZ: 0.5,
  
  DebugVolume: false,
  DebugShadow: false,
};

setRenderer(params.renderer);

function setRenderer(renderer) {
  switch(renderer) {
    case FORWARD:
      params._renderer = new ForwardRenderer();
      break;
    case CLUSTERED_FORWARD_PLUS:
      params._renderer = new ClusteredDeferredRenderer(15, 15, 15);
      break;
    case CLUSTERED_DEFFERED:
      params._renderer = new ClusteredDeferredRenderer(15, 15, 15);
      break;
  }
}

gui.add(params, 'renderer', [FORWARD, CLUSTERED_FORWARD_PLUS, CLUSTERED_DEFFERED]).onChange(setRenderer);

var dirLightPositions = gui.addFolder('Directional Light Position');
gui.add(params, 'Heterogenous');
gui.add(params, 'Density', 0, 0.5).name('Volume Density').onChange(setRenderer);
gui.add(params, 'UpscaleFactor', { '1': 1, '1/4': 4, '1/16': 16 });
gui.add(params, 'Interpolation', { 'Linear': 0, 'Nearest': 1 });
dirLightPositions.add(params, 'DirLightPosX', -5, 5).name('X');
dirLightPositions.add(params, 'DirLightPosZ', -2, 2).name('Z');

var sandboxFolder = gui.addFolder('Sandbox Mode');
sandboxFolder.add(params, 'SandboxMode').onChange(setRenderer);

var light1Folder = sandboxFolder.addFolder('Light 1');
var light1Positions = light1Folder.addFolder('Position');
light1Positions.add(params, 'Light1PosY', 0.0, 10.0).name('Y').onChange(setRenderer);
light1Positions.add(params, 'Light1PosZ', -5.0, 5.0).name('Z').onChange(setRenderer);
light1Folder.addColor(params, 'Light1Color').name('Color').onChange(setRenderer);
light1Folder.add(params, 'Light1Intensity', 1, 30).name('Intensity').onChange(setRenderer);
light1Folder.close();

var light2Folder = sandboxFolder.addFolder('Light 2');
var light2Positions = light2Folder.addFolder('Position');
light2Positions.add(params, 'Light2PosX', -10, 10.0).name('X').onChange(setRenderer);
light2Positions.add(params, 'Light2PosZ', -5.0, 5.0).name('Z').onChange(setRenderer);
light2Folder.addColor(params, 'Light2Color').name('Color').onChange(setRenderer);
light2Folder.add(params, 'Light2Intensity', 1, 30).name('Intensity').onChange(setRenderer);
light2Folder.close();

var volumeFolder = sandboxFolder.addFolder('Volume Position');
volumeFolder.add(params, 'VolumePosX', -10, 10).onChange(setRenderer);
volumeFolder.add(params, 'VolumePosY', -10, 10).onChange(setRenderer);
volumeFolder.add(params, 'VolumePosZ', -10, 10).onChange(setRenderer);
// volumeCoeffsFolder.add(params, 'Scattering', 0.25, 4).onChange(setRenderer);
// volumeCoeffsFolder.add(params, 'Absorption', 0.25, 4).onChange(setRenderer);
volumeFolder.close();

var debugFolder = gui.addFolder('Debug');
debugFolder.add(params, 'DebugShadow').name('Shadow Pass').onChange(setRenderer);
debugFolder.add(params, 'DebugVolume').name('Volume Pass').onChange(setRenderer);

const scene = new Scene();
scene.loadGLTF('models/sponza/sponza.gltf');
// scene.loadGLTF('models/box/box.gltf');

camera.position.set(-10, 8, 0);
cameraControls.target.set(0, 2, 0);
gl.enable(gl.DEPTH_TEST);

function render() {
  scene.update();
  params._renderer.render(camera, scene, 
    // Debug
    params.DebugVolume,
    params.DebugShadow,
    // Sandbox
    params.SandboxMode, 
    params.Light1Color, params.Light1Intensity, params.Light1PosY, params.Light1PosZ, 
    params.Light2Color, params.Light2Intensity, params.Light2PosX, params.Light2PosZ,
    params.VolumePosX, params.VolumePosY, params.VolumePosZ,
    params.VolumeScaleX, params.VolumeScaleY, params.VolumeScaleZ,
    // General
    params.UpscaleFactor, params.Heterogenous, params.Scattering, params.Absorption, params.Density, params.Interpolation,
    params.DirLightPosX, params.DirLightPosZ);
}

makeRenderLoop(render)();