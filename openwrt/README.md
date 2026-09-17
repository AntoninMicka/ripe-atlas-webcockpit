# OpenWrt / Turris packaging placeholder

This directory records the deployment boundary; it is not yet a working package.

The preferred M1 shape is a small package that:

1. installs versioned static files under the existing router web root,
2. adds a LuCI menu entry protected by the existing administration login,
3. opens no additional port,
4. owns a documented, finite set of files,
5. supports clean removal and Turris Schnapps rollback.

Before adding a package recipe, confirm the target Turris OS release, its LuCI generation and web-server conventions on the actual router. OpenWrt compatibility alone is not sufficient evidence for Turris Omnia acceptance.
