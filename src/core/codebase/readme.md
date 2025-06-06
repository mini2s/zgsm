```go
switch runtime.GOOS {
        case "windows":
                // Windows: 使用 %USERPROFILE% 或 %APPDATA%
                if userProfile := os.Getenv("USERPROFILE"); userProfile != "" {
                        rootDir = filepath.Join(userProfile, "."+appName)
                } else if appData := os.Getenv("APPDATA"); appData != "" {
                        rootDir = filepath.Join(appData, appName)
                } else {
                        // 备用方案：使用当前用户目录
                        homeDir, err := os.UserHomeDir()
                        if err != nil {
                                return "", err
                        }
                        rootDir = filepath.Join(homeDir, "."+appName)
                }
        case "darwin":
                // macOS: 使用 ~/Library/Application Support/ 或 ~/.appname
                homeDir, err := os.UserHomeDir()
                if err != nil {
                        return "", err
                }
                // 可以选择使用标准的 macOS 应用支持目录
                // rootDir = filepath.Join(homeDir, "Library", "Application Support", appName)
                // 或者使用简单的隐藏目录
                rootDir = filepath.Join(homeDir, "."+appName)
        default:
                // Linux 和其他 Unix-like 系统
                // XDG Base Directory Specification 标准
                // XDG_CONFIG_HOME: 用户配置文件的基础目录
                // - 如果设置了 XDG_CONFIG_HOME，通常是 ~/.config
                // - 如果未设置，默认为 ~/.config
                // - 最终路径示例: ~/.config/appname 或 /home/用户名/.config/appname
                if xdgConfig := os.Getenv("XDG_CONFIG_HOME"); xdgConfig != "" {
                        // 用户自定义了 XDG_CONFIG_HOME，使用该路径
                        // 例如: XDG_CONFIG_HOME=/custom/config -> /custom/config/appname
                        rootDir = filepath.Join(xdgConfig, appName)
                } else {
                        // 未设置 XDG_CONFIG_HOME，使用传统的隐藏目录方式
                        // 例如: ~/.appname 或 /home/用户名/.appname
                        homeDir, err := os.UserHomeDir()
                        if err != nil {
                                return "", err
                        }
                        rootDir = filepath.Join(homeDir, "."+appName)
                }
        }

        // 确保配置目录存在
        if err := os.MkdirAll(rootDir, 0755); err != nil {
                return "", err
        }
```
