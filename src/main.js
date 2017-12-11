import { makeRenderLoop, camera, cameraControls, gui, sandboxGUI, gl, DEBUG } from './init';
import ClusteredDeferredRenderer from './renderers/clusteredDeferred';
import Scene from './scene';

const CLUSTERED_DEFFERED = 'Clustered Deferred';

const params = {
  renderer: CLUSTERED_DEFFERED,
  _renderer: null,

  SandboxMode: false,

  Light1Color: [ 0, 128, 255 ],
  Light1Intensity: 1,
  Light1PosY: 0.0,
  Light1PosZ: 0.0,

  Light2Color: [ 255, 0, 0 ],
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
  DirLightCol: [255, 240, 218],
  
  DebugVolume: false,
  DebugShadow: false,

  AltFrame: 0,
  ToneMapType: 0,
  Exposure: 1.0,
  Intensity: 1.0
};

setRenderer(params.renderer);

function setRenderer(renderer) {
  switch(renderer) {
    case CLUSTERED_DEFFERED:
      params._renderer = new ClusteredDeferredRenderer(15, 15, 15);
      break;
  }
}

// GUI:

// Add new renderers like this:
//gui.add(params, 'renderer', [FORWARD, CLUSTERED_FORWARD_PLUS, CLUSTERED_DEFFERED]).onChange(setRenderer);

var volFolder = gui.addFolder('Volume Controls');
volFolder.add(params, 'Heterogenous').name('Heterogeneous');
volFolder.add(params, 'Density', 0, 0.5).name('Volume Density').onChange(setRenderer);
volFolder.add(params, 'UpscaleFactor', { '1': 1, '1/4': 4, '1/16': 16 });
volFolder.add(params, 'Interpolation', { 'Linear': 0, 'Nearest': 1 });
volFolder.add(params, 'AltFrame', { 'Every Frame': 0, 'Every two frames': 1 }).name('Render');
var volPosFolder = volFolder.addFolder('Position');
var volScaleFolder = volFolder.addFolder('Scale');
volScaleFolder.add(params, 'VolumeScaleX', 0.25, 4).name('X').onChange(setRenderer);
volScaleFolder.add(params, 'VolumeScaleY', 0.25, 4).name('Y').onChange(setRenderer);
volScaleFolder.add(params, 'VolumeScaleZ', 0.25, 4).name('Z').onChange(setRenderer);
volPosFolder.add(params, 'VolumePosX', -10, 10).name('X').onChange(setRenderer);
volPosFolder.add(params, 'VolumePosY', -10, 10).name('Y').onChange(setRenderer);
volPosFolder.add(params, 'VolumePosZ', -10, 10).name('Z').onChange(setRenderer);
volFolder.close();

var toneMapFolder = gui.addFolder('Tonemapping and Exposure');
toneMapFolder.add(params, 'ToneMapType', { 'Uncharted': 0, 'Reinhard': 1, 'Linear': 2});
toneMapFolder.add(params, 'Exposure', -5.0, 5.0);

var dirLight = gui.addFolder('Directional Light');
dirLight.addColor(params, 'DirLightCol').name('Color').onChange(setRenderer);
dirLight.add(params, 'Intensity', 0.2, 10.0).name('Light Intensity');
var dirLightPositions = dirLight.addFolder('Position');
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



var debugFolder = gui.addFolder('Debug');
debugFolder.add(params, 'DebugShadow').name('Shadow Pass').onChange(setRenderer);
debugFolder.add(params, 'DebugVolume').name('Volume Pass').onChange(setRenderer);

const scene = new Scene();
scene.loadGLTF('models/sponza/sponza.gltf');

camera.position.set(-10, 8, 0);
cameraControls.target.set(0, 2, 0);
gl.enable(gl.DEPTH_TEST);

function render() {
  scene.update(params.Intensity)
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
    params.AltFrame, params.ToneMapType, params.Exposure,
    params.DirLightPosX, params.DirLightPosZ, params.DirLightCol);
}

makeRenderLoop(render)();
