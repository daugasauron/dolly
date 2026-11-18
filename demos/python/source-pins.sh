# The python demo's upstream source pins, sourced by config/source-pins.sh.

DOLLY_CPYTHON_VERSION=3.14.7
DOLLY_CPYTHON_COMMIT=823f0323ee6ec1402088b73bce1a38473cac36dc
DOLLY_CPYTHON_URL='https://github.com/python/cpython.git'

DOLLY_LIBFFI_VERSION=3.5.2
DOLLY_LIBFFI_URL='https://github.com/libffi/libffi/releases/download/v3.5.2/libffi-3.5.2.tar.gz'
DOLLY_LIBFFI_SHA256=f3a3082a23b37c293a4fcd1053147b371f2ff91fa7ea1b2a52e335676bac82dc

DOLLY_MARKUPSAFE_URL='https://files.pythonhosted.org/packages/7e/99/7690b6d4034fffd95959cbe0c02de8deb3098cc577c67bb6a24fe5d7caa7/markupsafe-3.0.3.tar.gz'
DOLLY_MARKUPSAFE_SHA256=722695808f4b6457b320fdc131280796bdceb04ab50fe1795cd540799ebe1698
DOLLY_PACKAGING_URL='https://files.pythonhosted.org/packages/63/34/ba1c580383c9eada3711951fef0795c80b829a078d72188184bcab9dd527/packaging-26.3-py3-none-any.whl'
DOLLY_PACKAGING_SHA256=d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c

# The python-data images' libraries (demos/python): PyPI's sdists of the native ones, which
# python-data-build compiles, and the wheels of the pure-Python ones and of the build tools.
# Meson, packaging and MarkupSafe are the MESON, PACKAGING and MARKUPSAFE pins.
DOLLY_NUMPY_VERSION=2.5.4
DOLLY_NUMPY_URL='https://files.pythonhosted.org/packages/95/b0/c7453d0b6e2073c3264468b106ee1563750cecc910965e67357e3698c83e/numpy-2.5.4.tar.gz'
DOLLY_NUMPY_SHA256=9a94cf751c9ad8ebaa835bcd3d40dacf8534ad086b88c38029b65123c7999d2a
DOLLY_PANDAS_VERSION=3.0.5
DOLLY_PANDAS_URL='https://files.pythonhosted.org/packages/be/4f/5f3422a2afec5ffc46308b79e53291365a93748b498ac2e58bead0197916/pandas-3.0.5.tar.gz'
DOLLY_PANDAS_SHA256=dca3734d6ab7c906e6730f0788b0a1dbb9f2467731f9711f77995c8e9d62d712
DOLLY_MATPLOTLIB_VERSION=3.10.9
DOLLY_MATPLOTLIB_URL='https://files.pythonhosted.org/packages/63/1b/4be5be87d43d327a0cf4de1a56e86f7f84c89312452406cf122efe2839e6/matplotlib-3.10.9.tar.gz'
DOLLY_MATPLOTLIB_SHA256=fd66508e8c6877d98e586654b608a0456db8d7e8a546eb1e2600efd957302358
DOLLY_PILLOW_VERSION=13.0.0
DOLLY_PILLOW_URL='https://files.pythonhosted.org/packages/ce/a4/9cc30690a394a8305e8be4c9036aa16d0dfddadd09079860b582f562496d/pillow-13.0.0.tar.gz'
DOLLY_PILLOW_SHA256=cdcd1ba258178f7356d74170c9a81ba4eab6a5d55748bc402a5a2a6fe6be3510
DOLLY_KIWISOLVER_VERSION=1.5.1
DOLLY_KIWISOLVER_URL='https://files.pythonhosted.org/packages/ba/07/bd78e6a8fae171ea041ef5bba3ed21a003522fa088834b069b1909981f30/kiwisolver-1.5.1.tar.gz'
DOLLY_KIWISOLVER_SHA256=f1303ef2eec81262a4b708c3e858afe58d7c75ad91c1c05266eda7673369859a
DOLLY_CONTOURPY_VERSION=1.4.0
DOLLY_CONTOURPY_URL='https://files.pythonhosted.org/packages/83/5a/a55177dd22553a277388e8a1b3220e92de91bacb28356cdc73caa240121d/contourpy-1.4.0.tar.gz'
DOLLY_CONTOURPY_SHA256=20156f5a1ac4f8ce02656e39a61e82164a3d359796dc8026f75b062783d500e1
DOLLY_CYCLER_VERSION=0.12.1
DOLLY_CYCLER_URL='https://files.pythonhosted.org/packages/e7/05/c19819d5e3d95294a6f5947fb9b9629efb316b96de511b418c53d245aae6/cycler-0.12.1-py3-none-any.whl'
DOLLY_CYCLER_SHA256=85cef7cff222d8644161529808465972e51340599459b8ac3ccbac5a854e0d30
DOLLY_PYPARSING_VERSION=3.3.3
DOLLY_PYPARSING_URL='https://files.pythonhosted.org/packages/38/bb/d215ee7c73b61497b28a5503f9f53523f294fcc936762b7caf90e0c1c2b5/pyparsing-3.3.3-py3-none-any.whl'
DOLLY_PYPARSING_SHA256=ece8c00a69cf01b45d0b1dedabb469c90d8caf996d4fda40f147627a122849a4
DOLLY_DATEUTIL_VERSION=4.0.0
DOLLY_DATEUTIL_URL='https://files.pythonhosted.org/packages/2f/a9/52b89563d154433d79b51ed1eb4842bf7334cb2696891a7fe135618853d7/python_dateutil-4.0.0-py3-none-any.whl'
DOLLY_DATEUTIL_SHA256=a5e246f79eb80475e691bf93862cead98decd8a498cf53ba0516fcdc0f50dc1c
DOLLY_TZDATA_VERSION=2026.6
DOLLY_TZDATA_URL='https://files.pythonhosted.org/packages/0a/66/9a06c2227fedfd4919f0eaaa8b94377d9730882a7e4f95823c9a331ab5e1/tzdata-2026.6-py2.py3-none-any.whl'
DOLLY_TZDATA_SHA256=0a10eec6e13ef16b627fabed9a5f2ba61a62b1c67f327305f4e7e412a70b4aec
DOLLY_SEABORN_VERSION=0.13.2
DOLLY_SEABORN_URL='https://files.pythonhosted.org/packages/83/11/00d3c3dfc25ad54e731d91449895a79e4bf2384dc3ac01809010ba88f6d5/seaborn-0.13.2-py3-none-any.whl'
DOLLY_SEABORN_SHA256=636f8336facf092165e27924f223d3c62ca560b1f2bb5dff7ab7fad265361987
DOLLY_JINJA2_VERSION=3.1.6
DOLLY_JINJA2_URL='https://files.pythonhosted.org/packages/62/a1/3d680cbfd5f4b8f15abc1d571870c5fc3e594bb582bc3b64ea099db13e56/jinja2-3.1.6-py3-none-any.whl'
DOLLY_JINJA2_SHA256=85ece4451f492d0c13c5dd7c13a64681a86afae63a5f347908daf103ce6d2f67
DOLLY_OPENPYXL_VERSION=3.1.5
DOLLY_OPENPYXL_URL='https://files.pythonhosted.org/packages/c0/da/977ded879c29cbd04de313843e76868e6e13408a94ed6b987245dc7c8506/openpyxl-3.1.5-py2.py3-none-any.whl'
DOLLY_OPENPYXL_SHA256=5282c12b107bffeef825f4617dc029afaf41d0ea60823bbb665ef3079dc79de2
DOLLY_ET_XMLFILE_VERSION=2.0.0
DOLLY_ET_XMLFILE_URL='https://files.pythonhosted.org/packages/c1/8b/5fe2cc11fee489817272089c4203e679c63b570a5aaeb18d852ae3cbba6a/et_xmlfile-2.0.0-py3-none-any.whl'
DOLLY_ET_XMLFILE_SHA256=7a91720bc756843502c3b7504c77b8fe44217c85c537d85037f0f536151b2caa
DOLLY_TABULATE_VERSION=0.10.0
DOLLY_TABULATE_URL='https://files.pythonhosted.org/packages/99/55/db07de81b5c630da5cbf5c7df646580ca26dfaefa593667fc6f2fe016d2e/tabulate-0.10.0-py3-none-any.whl'
DOLLY_TABULATE_SHA256=f0b0622e567335c8fabaaa659f1b33bcb6ddfe2e496071b743aa113f8774f2d3
DOLLY_MESON_PYTHON_VERSION=0.22.1
DOLLY_MESON_PYTHON_URL='https://files.pythonhosted.org/packages/96/62/0c1cf20fe158b0e623e78acbf5fb6de5f1410a408f65f727e4090497627b/meson_python-0.22.1-py3-none-any.whl'
DOLLY_MESON_PYTHON_SHA256=258fde948cf45aab5df23fcc9e17a9050ee73d4e1002fe6cf86519f61c414778
DOLLY_CYTHON_VERSION=3.3.1
DOLLY_CYTHON_URL='https://files.pythonhosted.org/packages/9d/55/088578d75bc8dbcbc535af04b1d596ff227ca756dd74f9d3c1c526f955d0/cython-3.3.1-py3-none-any.whl'
DOLLY_CYTHON_SHA256=61abc7feedd20dac6c4ff7ab3a30e17136a067b242ab9253e2b4a6d9a72c2b61
DOLLY_PYPROJECT_METADATA_VERSION=0.12.1
DOLLY_PYPROJECT_METADATA_URL='https://files.pythonhosted.org/packages/b9/8e/d883718e872abc214ba053f60f7e6edc2abd5ffbd1544beb01a9c92ddd3c/pyproject_metadata-0.12.1-py3-none-any.whl'
DOLLY_PYPROJECT_METADATA_SHA256=f7162d580a96386a8eb096da06215f981f547d1490f03055ef99e323bc2da427
DOLLY_PYBIND11_VERSION=3.1.0
DOLLY_PYBIND11_URL='https://files.pythonhosted.org/packages/33/fd/8762f7ee3e4e4be6d1d846cffb4916dd9bb02b2f800d3603718a0efe494c/pybind11-3.1.0-py3-none-any.whl'
DOLLY_PYBIND11_SHA256=b8488090f8acffbcb6b5d6a85571a6827a0a2981ffb75e5a0b27b87c4a6b7dd0
DOLLY_SETUPTOOLS_VERSION=84.2.1
DOLLY_SETUPTOOLS_URL='https://files.pythonhosted.org/packages/ef/55/6dc6d6bb953bdfc52519a0059592c52b6e3b8ad51cf8256dffceb55b0610/setuptools-84.2.1-py3-none-any.whl'
DOLLY_SETUPTOOLS_SHA256=ca140b45d5325a9478f880e351484f62fef15f336462e449ca0c03c873d589c2
DOLLY_SETUPTOOLS_SCM_VERSION=9.2.2
DOLLY_SETUPTOOLS_SCM_URL='https://files.pythonhosted.org/packages/3d/ea/ac2bf868899d0d2e82ef72d350d97a846110c709bacf2d968431576ca915/setuptools_scm-9.2.2-py3-none-any.whl'
DOLLY_SETUPTOOLS_SCM_SHA256=30e8f84d2ab1ba7cb0e653429b179395d0c33775d54807fc5f1dd6671801aef7
DOLLY_CPPY_VERSION=1.3.1
DOLLY_CPPY_URL='https://files.pythonhosted.org/packages/8b/3c/823fda3f226d84f983e48005527a6dd2dc365220ac4f098b770779d9f4a1/cppy-1.3.1-py3-none-any.whl'
DOLLY_CPPY_SHA256=7ca132b6ef6187384738804bd3a453d4eab7e3274df6dcd35e5d92aae3404717
DOLLY_VERSIONEER_VERSION=0.29
DOLLY_VERSIONEER_URL='https://files.pythonhosted.org/packages/b0/79/f0f1ca286b78f6f33c521a36b5cbd5bd697c0d66217d8856f443aeb9dd77/versioneer-0.29-py3-none-any.whl'
DOLLY_VERSIONEER_SHA256=0f1a137bb5d6811e96a79bb0486798aeae9b9c6efc24b389659cebb0ee396cb9
# The Qhull Matplotlib's release builds into its extensions, at its subprojects/qhull.wrap pin.
DOLLY_MPL_QHULL_VERSION=8.0.2
DOLLY_MPL_QHULL_URL='https://github.com/qhull/qhull/archive/v8.0.2/qhull-8.0.2.tar.gz'
DOLLY_MPL_QHULL_SHA256=8774e9a12c70b0180b95d6b0b563c5aa4bea8d5960c15e18ae3b6d2521d64f8b
# OpenBLAS (demos/python's openblas package): BLAS and LAPACK for SciPy, upstream's release archive.
DOLLY_OPENBLAS_VERSION=0.3.34
DOLLY_OPENBLAS_URL='https://github.com/OpenMathLib/OpenBLAS/releases/download/v0.3.34/OpenBLAS-0.3.34.tar.gz'
DOLLY_OPENBLAS_SHA256=cd7e129868320cc2d033afa920e31202dfe0b8066a5b66661900ccc0f197dfed
