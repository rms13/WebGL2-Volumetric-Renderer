// NOISE GENERATION ALGORITHMS
// FRACTAL NOISE
// adapted from my older project for testing purpose.. 
// works well for shaders but too slow for cpu..
// https://github.com/rms13/Project1-Noise/blob/4140081efaf4fb1ef4941ee153b645d6b06b647e/src/shaders/icosh-vert.glsl

import {vec2, vec3} from 'gl-matrix';

export default function noise3D(point, resolution, type) {
    switch(type) {
        case 'random3d':
            return random3D(point);
        //break;
        case 'fbm3d':
            return fbm3D(point);
    }

    function fract(f) {
        return f % 1;
    }

    function random3D(point) {
        return fract(Math.sin(vec3.dot(point, vec3.fromValues(12.9898,78.233,138.531))) * 43758.5453);
    }

    function smoothnoise(x2, y2, z2)
    {	
        var noise = 0.0;
        var div = 0.0;
        for(var i=-1.0; i<2.0; i++)
        {
            for(var j=-1.0; j<2.0; j++)
            {
                for(var k=-1.0; k<2.0; k++)
                {
                    if(Math.abs(i)+Math.abs(j)+Math.abs(k)==3.0)
                        div=32.0;
                    else if(Math.abs(i)+Math.abs(j)+Math.abs(k)==2.0)
                        div=16.0;
                    else if(Math.abs(i)+Math.abs(j)+Math.abs(k)==1.0)
                        div=12.0;
                    else
                        div=4.0;


                    var n = random3D(vec3.fromValues(x2+Math.floor(i),y2+Math.floor(j),z2+Math.floor(k)));
                        
                    noise += (n / div);
                   // console.log(noise);
                }
            }
        }
        
        return noise;
    }

    function interp(a, b, f)
    {
        var f1 = f * 3.1415927;
        f1 = (1.0 - Math.cos(f1)) * 0.5;
        
        return a*(1.0-f1) + b*f1;
    }

    function intnoise(x1, y1, z1)
    {
        var ix = Math.floor(x1);
        var iy = Math.floor(y1);
        var iz = Math.floor(z1);
        var fx = x1-ix;
        var fy = y1-iy;
        var fz = z1-iz;

        var v1 = smoothnoise(ix,iy,iz);
        var v2 = smoothnoise(ix,iy+1,iz);
        var v3 = smoothnoise(ix,iy,iz+1);
        var v4 = smoothnoise(ix,iy+1,iz+1);
        var v5 = smoothnoise(ix+1,iy,iz);
        var v6 = smoothnoise(ix+1,iy+1,iz);
        var v7 = smoothnoise(ix+1,iy,iz+1);
        var v8 = smoothnoise(ix+1,iy+1,iz+1);
    
        var i1 = interp(v1, v2, fy);
        var i2 = interp(v3, v4, fy);
        var i3 = interp(v5, v6, fy);
        var i4 = interp(v7, v8, fy);
        
        var i5=interp(i1, i2, fz);
        var i6=interp(i3, i4, fz);
        
        var i7=interp(i5, i6, fx);
        
        
        return i7;
    }
    

    function fbm3D(point) {
        // return Math.random();

        var total = 0.0;
        for(var i=0.0; i<4.0; i++) // octaves = 4
        {
            var freq = Math.pow(2.0,i);
            var amp = Math.pow(0.5,i); // persistence = 0.25
            total += intnoise(point[0] * freq*4.0, point[1]* freq*4.0, point[2] * freq*4.0) * amp;
        }
        //console.log(total);
        return total;
    }
}
