// Aurora.js - WebGL Implementation
class Aurora {
  constructor(container, options = {}) {
    console.log("Aurora constructor called with container:", container);
    this.container = container;
    this.options = {
      colorStops: options.colorStops || ["#3A29FF", "#FF94B4", "#FF3232"],
      blend: options.blend || 0.5,
      amplitude: options.amplitude || 1.0,
      speed: options.speed || 0.5
    };
    
    // Check container dimensions
    console.log("Container dimensions:", this.container.offsetWidth, "x", this.container.offsetHeight);
    
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.zIndex = '1';
    this.canvas.style.pointerEvents = 'none'; // Ensure the canvas doesn't block interactions
    this.container.appendChild(this.canvas);
    console.log("Canvas appended to container");
    
    // 初始化时立即调整画布大小
    this.resizeCanvas();
    
    // 监听窗口大小变化，确保画布大小正确
    window.addEventListener('resize', () => {
      this.resizeCanvas();
    });
    
    // Use a small timeout to ensure the container has been properly laid out
    setTimeout(() => {
      this.initWebGL();
    }, 500); // 增加超时时间，确保容器完全渲染
  }
  
  initWebGL() {
    this.resizeCanvas();
    
    // Initialize WebGL
    try {
      this.gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true }) || 
                this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true }) || 
                this.canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: true });
      
      if (!this.gl) {
        console.error("WebGL not supported, falling back to canvas 2D");
        this.fallbackToCanvas2D();
        return;
      }
    } catch (e) {
      console.error("Error initializing WebGL:", e);
      this.fallbackToCanvas2D();
      return;
    }
    
    // Ensure canvas has valid dimensions
    if (this.canvas.width === 0 || this.canvas.height === 0) {
      console.warn("Canvas has invalid dimensions, retrying...");
      setTimeout(() => this.initWebGL(), 300);
      return;
    }
    
    console.log("WebGL initialized with canvas dimensions:", this.canvas.width, "x", this.canvas.height);
    
    // Set up WebGL
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
    
    // Compile shaders
    const vertexShader = this.compileShader(this.vertexShaderSource(), this.gl.VERTEX_SHADER);
    const fragmentShader = this.compileShader(this.fragmentShaderSource(), this.gl.FRAGMENT_SHADER);
    
    if (!vertexShader || !fragmentShader) {
      this.fallbackToCanvas2D();
      return;
    }
    
    // Create program
    this.program = this.gl.createProgram();
    this.gl.attachShader(this.program, vertexShader);
    this.gl.attachShader(this.program, fragmentShader);
    this.gl.linkProgram(this.program);
    
    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      console.error("Program linking error:", this.gl.getProgramInfoLog(this.program));
      this.fallbackToCanvas2D();
      return;
    }
    
    this.gl.useProgram(this.program);
    
    // Create triangle geometry
    const vertices = new Float32Array([
      -1, -1,
      3, -1,
      -1, 3
    ]);
    
    const vertexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
    
    // Set attributes
    const positionLocation = this.gl.getAttribLocation(this.program, "position");
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);
    
    // Get uniform locations
    this.timeLocation = this.gl.getUniformLocation(this.program, "uTime");
    this.amplitudeLocation = this.gl.getUniformLocation(this.program, "uAmplitude");
    this.colorStopsLocation = this.gl.getUniformLocation(this.program, "uColorStops");
    this.resolutionLocation = this.gl.getUniformLocation(this.program, "uResolution");
    this.blendLocation = this.gl.getUniformLocation(this.program, "uBlend");
    
    // Convert color stops to RGB arrays
    this.colorStopsArray = this.options.colorStops.map(hex => this.hexToRgb(hex));
    
    // Start animation
    this.startTime = performance.now();
    this.animate();
  }
  
  resizeCanvas() {
    // 获取容器的实际尺寸
    const containerWidth = this.container.offsetWidth || this.container.clientWidth || window.innerWidth;
    const containerHeight = this.container.offsetHeight || this.container.clientHeight || window.innerHeight;
    
    
    // 确保我们有有效的尺寸
    if (containerWidth > 0 && containerHeight > 0) {
      // 使用设备像素比来提高清晰度
      const pixelRatio = window.devicePixelRatio || 1;
      this.canvas.width = containerWidth * pixelRatio;
      this.canvas.height = containerHeight * pixelRatio;
      
      // 保持显示尺寸不变
      this.canvas.style.width = containerWidth + 'px';
      this.canvas.style.height = containerHeight + 'px';
      
      // 如果 WebGL 上下文已初始化，更新视口
      if (this.gl) {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        // 如果着色器程序已创建，更新分辨率统一变量
        if (this.program && this.resolutionLocation) {
          this.gl.useProgram(this.program);
          this.gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
        }
      }
    } else {
      console.warn("Container has invalid dimensions:", containerWidth, "x", containerHeight);
      // 如果容器尺寸无效，强制使用最小尺寸
      const pixelRatio = window.devicePixelRatio || 1;
      this.canvas.width = Math.max(window.innerWidth, 1200) * pixelRatio;
      this.canvas.height = Math.max(500, window.innerHeight * 0.6) * pixelRatio;
      console.log("Forced canvas dimensions:", this.canvas.width, "x", this.canvas.height);
    }
  }
  
  compileShader(source, type) {
    const shader = this.gl.createShader(type);
    if (!shader) return null;
    
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
  
  vertexShaderSource() {
    // Use WebGL 1.0 compatible shader if WebGL 2.0 is not available
    if (this.gl instanceof WebGL2RenderingContext) {
      return `#version 300 es
        in vec2 position;
        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `;
    } else {
      return `
        attribute vec2 position;
        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `;
    }
  }
  
  fragmentShaderSource() {
    // Use WebGL 1.0 compatible shader if WebGL 2.0 is not available
    if (this.gl instanceof WebGL2RenderingContext) {
      return `#version 300 es
        precision highp float;

        uniform float uTime;
        uniform float uAmplitude;
        uniform vec3 uColorStops[3];
        uniform vec2 uResolution;
        uniform float uBlend;

        out vec4 fragColor;

        vec3 permute(vec3 x) {
          return mod(((x * 34.0) + 1.0) * x, 289.0);
        }

        float snoise(vec2 v){
          const vec4 C = vec4(
              0.211324865405187, 0.366025403784439,
              -0.577350269189626, 0.024390243902439
          );
          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod(i, 289.0);

          vec3 p = permute(
              permute(i.y + vec3(0.0, i1.y, 1.0))
            + i.x + vec3(0.0, i1.x, 1.0)
          );

          vec3 m = max(
              0.5 - vec3(
                  dot(x0, x0),
                  dot(x12.xy, x12.xy),
                  dot(x12.zw, x12.zw)
              ), 
              0.0
          );
          m = m * m;
          m = m * m;

          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        struct ColorStop {
          vec3 color;
          float position;
        };

        #define COLOR_RAMP(colors, factor, finalColor) {              \
          int index = 0;                                            \
          for (int i = 0; i < 2; i++) {                               \
             ColorStop currentColor = colors[i];                    \
             bool isInBetween = currentColor.position <= factor;    \
             index = int(mix(float(index), float(i), float(isInBetween))); \
          }                                                         \
          ColorStop currentColor = colors[index];                   \
          ColorStop nextColor = colors[index + 1];                  \
          float range = nextColor.position - currentColor.position; \
          float lerpFactor = (factor - currentColor.position) / range; \
          finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / uResolution;
          
          ColorStop colors[3];
          colors[0] = ColorStop(uColorStops[0], 0.0);
          colors[1] = ColorStop(uColorStops[1], 0.5);
          colors[2] = ColorStop(uColorStops[2], 1.0);
          
          vec3 rampColor;
          COLOR_RAMP(colors, uv.x, rampColor);
          
          float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
          height = exp(height);
          height = (uv.y * 2.0 - height + 0.2);
          float intensity = 0.6 * height;
          
          // midPoint is fixed; uBlend controls the transition width.
          float midPoint = 0.20;
          float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
          
          vec3 auroraColor = intensity * rampColor;
          
          // Premultiplied alpha output.
          fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
        }
      `;
    } else {
      return `
        precision highp float;

        uniform float uTime;
        uniform float uAmplitude;
        uniform vec3 uColorStops[3];
        uniform vec2 uResolution;
        uniform float uBlend;

        vec3 permute(vec3 x) {
          return mod(((x * 34.0) + 1.0) * x, 289.0);
        }

        float snoise(vec2 v){
          const vec4 C = vec4(
              0.211324865405187, 0.366025403784439,
              -0.577350269189626, 0.024390243902439
          );
          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod(i, 289.0);

          vec3 p = permute(
              permute(i.y + vec3(0.0, i1.y, 1.0))
            + i.x + vec3(0.0, i1.x, 1.0)
          );

          vec3 m = max(
              0.5 - vec3(
                  dot(x0, x0),
                  dot(x12.xy, x12.xy),
                  dot(x12.zw, x12.zw)
              ), 
              0.0
          );
          m = m * m;
          m = m * m;

          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        struct ColorStop {
          vec3 color;
          float position;
        };

        vec3 colorRamp(ColorStop colors[3], float factor) {
          int index = 0;
          for (int i = 0; i < 2; i++) {
             ColorStop currentColor = colors[i];
             if (currentColor.position <= factor) {
               index = i;
             }
          }
          
          ColorStop currentColor = colors[index];
          ColorStop nextColor = colors[index + 1];
          float range = nextColor.position - currentColor.position;
          float lerpFactor = (factor - currentColor.position) / range;
          return mix(currentColor.color, nextColor.color, lerpFactor);
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / uResolution;
          
          ColorStop colors[3];
          colors[0] = ColorStop(uColorStops[0], 0.0);
          colors[1] = ColorStop(uColorStops[1], 0.5);
          colors[2] = ColorStop(uColorStops[2], 1.0);
          
          vec3 rampColor = colorRamp(colors, uv.x);
          
          float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
          height = exp(height);
          height = (uv.y * 2.0 - height + 0.2);
          float intensity = 0.6 * height;
          
          // midPoint is fixed; uBlend controls the transition width.
          float midPoint = 0.20;
          float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
          
          vec3 auroraColor = intensity * rampColor;
          
          // Premultiplied alpha output.
          gl_FragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
        }
      `;
    }
  }
  
  hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace(/^#/, '');
    
    // Parse hex to RGB
    let r, g, b;
    if (hex.length === 3) {
      r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
      g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
      b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
    } else {
      r = parseInt(hex.substring(0, 2), 16) / 255;
      g = parseInt(hex.substring(2, 4), 16) / 255;
      b = parseInt(hex.substring(4, 6), 16) / 255;
    }
    
    return [r, g, b];
  }
  
  animate() {
    this.resizeCanvas();
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    
    // Update uniforms
    const currentTime = performance.now();
    const time = (currentTime - this.startTime) / 1000.0;
    
    this.gl.uniform1f(this.timeLocation, time * this.options.speed);
    this.gl.uniform1f(this.amplitudeLocation, this.options.amplitude);
    this.gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
    this.gl.uniform1f(this.blendLocation, this.options.blend);
    
    // Set color stops
    const flatColorArray = new Float32Array(this.colorStopsArray.flat());
    this.gl.uniform3fv(this.colorStopsLocation, flatColorArray);
    
    // Draw
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    
    // Continue animation
    requestAnimationFrame(() => this.animate());
  }
  
  fallbackToCanvas2D() {
    // 简单的 Canvas 2D 回退实现
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    
    // 简单的渐变背景
    const gradient = ctx.createLinearGradient(0, 0, this.canvas.width, 0);
    this.options.colorStops.forEach((color, index) => {
      gradient.addColorStop(index / (this.options.colorStops.length - 1), color);
    });
    
    const animate = () => {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      requestAnimationFrame(animate);
    };
    
    animate();
  }
}

// 确保脚本在页面完全加载后执行
window.addEventListener('load', function() {
  // 尝试多种方式查找容器
  const container = document.querySelector('.aurora-container');
  if (container) {
    new Aurora(container, {
      colorStops: ["#00AAFF", "#FF3232","#7CFF67" ],
      blend: 0.7,
      amplitude: 1.5,
      speed: 0.65
    });
  } else {
    console.error("Aurora container not found! DOM structure:", document.body.innerHTML);
  }
}); 