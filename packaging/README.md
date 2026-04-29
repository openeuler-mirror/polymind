# PolyMind Web 部署指南

## 一、目录结构
```
packaging/
├── .env.template          # 配置模板文件（所有支持的配置项参考）
├── pm2.config.js.template # PM2配置模板
├── nginx.conf.template    # Nginx配置模板
├── build.sh               # 构建脚本
└── README.md              # 说明文档
```

## 二、构建方式
一次构建，多环境部署，修改配置无需重新构建。

#### 构建步骤：
```bash
# 进入packaging目录
cd packaging

# 赋予脚本执行权限
chmod +x build.sh

# 执行构建
./build.sh
```
构建完成后会在项目根目录生成 `polymind-1.0.0.tgz` npm安装包。

#### 安装使用：
```bash
# 全局安装
npm install -g polymind-1.0.0.tgz

# 启动服务
polymind
```
服务默认监听3000端口，访问`http://服务器IP:3000`即可使用。

## 三、配置说明
### 优先级规则（重要！）
```
当前项目目录下的 .env  >  全局配置 ~/.polymind/.env  >  代码默认值
```

### 配置生效方式
✅ **修改配置后仅需重启服务即可生效，不需要重新构建！**

### 全局配置（推荐）
1. 创建全局配置目录和文件：
```bash
mkdir -p ~/.polymind
cp .env.template ~/.polymind/.env
```
2. 编辑配置文件，填入你的实际参数：
```bash
vi ~/.polymind/.env
```
3. 重启服务后配置自动生效。

### 本地临时配置
如果需要针对当前目录单独配置，可以在项目根目录创建`.env`文件，里面的配置会覆盖全局配置。

### 可配置参数说明
| 参数名 | 说明 | 默认值 |
| --- | --- | --- |
| SERVER_PORT | Node.js服务监听端口 | 3000 |
| SERVER_DOMAIN | 服务访问域名 | localhost |
| NEXT_PUBLIC_AGENTD_API_URL | 后端API服务地址 | http://127.0.0.1:8000 |
| NEXT_PUBLIC_WS_URL | WebSocket服务地址 | ws://127.0.0.1:8000/ws |
| NEXT_PUBLIC_API_TIMEOUT | API请求超时时间（毫秒） | 30000 |
| NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS | 最大重连次数 | 5 |
| NEXT_PUBLIC_APP_NAME | 应用名称 | PolyMind |
| NEXT_PUBLIC_DEBUG | 是否开启调试模式 | false |
| NGINX_CONF_DIR | Nginx配置文件目录（如需配置Nginx时使用） | /etc/nginx/conf.d |
| PM2_PROCESS_NAME | PM2进程名称 | polymind-web |
| PM2_INSTANCES | PM2进程实例数 | max（使用所有CPU核心） |

## 四、开发模式
```bash
# 直接启动开发服务，自动加载全局+本地配置
pnpm dev
```
开发服务默认监听3000端口，支持热更新。

## 五、生产部署推荐方案
### PM2进程守护（推荐）
```bash
# 安装PM2
npm install -g pm2

# 复制PM2配置模板
cp pm2.config.js.template pm2.config.js
# 编辑pm2.config.js修改你需要的参数

# 启动服务
pm2 start pm2.config.js

# 设置开机自启
pm2 startup && pm2 save
```

### Nginx反向代理（生产必备）
```bash
# 复制Nginx配置模板
cp nginx.conf.template /etc/nginx/conf.d/polymind-web.conf
# 编辑配置文件修改域名、端口等参数

# 验证配置并生效
nginx -t
nginx -s reload
```
配置后可以通过域名访问，Nginx会自动处理静态资源、WebSocket代理、HTTPS等。

## 六、常用服务管理命令
```bash
# 查看进程状态
pm2 status polymind-web

# 查看运行日志
pm2 logs polymind-web

# 修改配置后重启服务（必须加--update-env刷新环境变量）
pm2 restart polymind-web --update-env

# 停止服务
pm2 stop polymind-web

# 查看资源占用
pm2 monit
```

## 七、部署验证
1. 访问服务地址，确认页面正常加载
2. 打开浏览器控制台输入`window.__APP_CONFIG__`，确认配置项正确
3. 测试聊天功能，确认API和WebSocket连接正常

## 八、常见问题
### Q：修改配置后不生效？
A：执行`pm2 restart polymind-web --update-env`重启服务，确保加了`--update-env`参数刷新环境变量。

### Q：前端还是请求127.0.0.1:8000？
A：检查全局配置文件`~/.polymind/.env`是否正确配置了`NEXT_PUBLIC_AGENTD_API_URL`参数，重启服务即可。

### Q：需要针对不同环境构建不同的包吗？
A：不需要，同一npm包可以部署到任意环境，只需要修改目标机器上的`~/.polymind/.env`配置文件即可。

### Q：如何升级到新版本？
A：重新构建npm包，在目标服务器执行`npm install -g polymind-新版本号.tgz`覆盖安装，重启服务即可完成升级。
