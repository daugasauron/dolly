DOLLY 3
MODULE zero-ad

REQUIRES TOOL slop

# External wasm64 bootstrap; pinned sources and port instructions: docs/sources.md.
SOURCE HOST /static/zero-ad/pyrogenesis.wasm /opt/0ad/system/pyrogenesis 7e36b9b2ab5c5a5e62ba656f288083b133b46f5a848ae5fe03643a1d372a2e7b
SOURCE HOST /static/zero-ad/data/config/default.cfg /opt/0ad/data/config/default.cfg 96fe2f626983f3a9b2392095c11f04b3a8a318531408ce9aea0f4bd5c2a60f5a
SOURCE HOST /static/zero-ad/data/config/keys.txt /opt/0ad/data/config/keys.txt 469f8fa2807838de81d53dda3a78b1676013e4fd18bd696d53693f09a21b9410
SOURCE HOST /static/zero-ad/data/config/local.cfg /opt/0ad/data/config/local.cfg 1621faf65a3bb653b42401500e179f4b02d334646cd274ae1228ac6197407b12
SOURCE HOST /static/zero-ad/data/icu/icudt68l.dat /opt/0ad/data/icu/icudt68l.dat d8e42c5c797e98f934a6a31e959231c2396ab68242f95d9e7b9f7783f71dc611
SOURCE HOST /static/zero-ad/data/l10n/.tx/config /opt/0ad/data/l10n/.tx/config 5f52c7d149211b418ca602c5e737248be8b263bdd8ac3d79ecc7c5584f65b4e8
SOURCE HOST /static/zero-ad/data/l10n/ca.engine.po /opt/0ad/data/l10n/ca.engine.po a1c07a8db1e20935a86cdd6354ff3897f633bba5a533c9e46170b96599dc1f6d
SOURCE HOST /static/zero-ad/data/l10n/cs.engine.po /opt/0ad/data/l10n/cs.engine.po 409139f2337cf54a6e599c30d5d81255a7c3fe092a57b307636556bdea05379e
SOURCE HOST /static/zero-ad/data/l10n/de.engine.po /opt/0ad/data/l10n/de.engine.po 70f03f8c81905ec614c790b4abeadabf26a3b08fcdfb6f3db79f132464d1db4c
SOURCE HOST /static/zero-ad/data/l10n/el.engine.po /opt/0ad/data/l10n/el.engine.po 212b93fe25bbe0696d7ebe6f991e1c3ff67a0b0c39a34f88d97c75627d556775
SOURCE HOST /static/zero-ad/data/l10n/en_GB.engine.po /opt/0ad/data/l10n/en_GB.engine.po 11d4a5fb307ce179fa62dae4f08cdbc9d7283972864a9d69053d00067ff32a94
SOURCE HOST /static/zero-ad/data/l10n/engine.pot /opt/0ad/data/l10n/engine.pot da69a0c8a874cc8719d4b0a4823ffbb0ffb35f2c8d8a43bd73750f0f77e44003
SOURCE HOST /static/zero-ad/data/l10n/es.engine.po /opt/0ad/data/l10n/es.engine.po 49075bbf0952ef5293db9814c7983db71fd1e50796b7da3cb5630bd3e793b1b8
SOURCE HOST /static/zero-ad/data/l10n/eu.engine.po /opt/0ad/data/l10n/eu.engine.po 10977f86ca158b880cfbb456309a92c7e1226569a126ced20e2ceeabe63ae571
SOURCE HOST /static/zero-ad/data/l10n/fi.engine.po /opt/0ad/data/l10n/fi.engine.po 306a8dc3e74625ded5cc4b5063ec30c36c755552497badb95723166905e3d1d7
SOURCE HOST /static/zero-ad/data/l10n/fr.engine.po /opt/0ad/data/l10n/fr.engine.po 6333c06ef6a054a2b70cc413adc7742d1eac3d936ebfa90f52f01d529caba6af
SOURCE HOST /static/zero-ad/data/l10n/gl.engine.po /opt/0ad/data/l10n/gl.engine.po e72d4ca0b0aa799b403d9f0f9a273aa9139f72eeae8a900ed7a950f1fdf59f30
SOURCE HOST /static/zero-ad/data/l10n/hu.engine.po /opt/0ad/data/l10n/hu.engine.po 28b3c10d3eb48c501443cbcbb38673cb558f906f961da92258f4b321ac03c409
SOURCE HOST /static/zero-ad/data/l10n/id.engine.po /opt/0ad/data/l10n/id.engine.po e608537ce3b2b3be8b481c6989b734b00819e3499c0b2ffd544bcee3fd91df2a
SOURCE HOST /static/zero-ad/data/l10n/it.engine.po /opt/0ad/data/l10n/it.engine.po 07e4b808d3cda0108916d29c4e4ce14ce2dc77ddff519b42d6c75efe026d5b04
SOURCE HOST /static/zero-ad/data/l10n/ja.engine.po /opt/0ad/data/l10n/ja.engine.po 036cad0926938ebab3dc217c0a866a9374d4e76a30448a8980e8ba9b3d8695e0
SOURCE HOST /static/zero-ad/data/l10n/ko.engine.po /opt/0ad/data/l10n/ko.engine.po f07399c60c61ff47d522f69edfc5b7bd57deed41b38777834fa457d659df9b3b
SOURCE HOST /static/zero-ad/data/l10n/messages.json /opt/0ad/data/l10n/messages.json 69075b1f49598bce2061f8cf5f6667b14a83e852790c645da4801d3d590fe3ec
SOURCE HOST /static/zero-ad/data/l10n/nl.engine.po /opt/0ad/data/l10n/nl.engine.po 76f884572e9b995d81066d857ef449e7fdeac8a030b032fa299fa0fb134a6ca4
SOURCE HOST /static/zero-ad/data/l10n/pl.engine.po /opt/0ad/data/l10n/pl.engine.po abe2a28c539aa44e5890824f9adb1086cc6f990544ea21e308bc65a6887371e3
SOURCE HOST /static/zero-ad/data/l10n/pt_BR.engine.po /opt/0ad/data/l10n/pt_BR.engine.po 3a75e135d72ad7e9b74d2b2102b1d3c1d50dc85cfe67744566b44c8ee24b32d5
SOURCE HOST /static/zero-ad/data/l10n/pt_PT.engine.po /opt/0ad/data/l10n/pt_PT.engine.po 18b2886502b571cce9e71753ae8c1698397b3860033f458aaf0716eb4532b622
SOURCE HOST /static/zero-ad/data/l10n/ru.engine.po /opt/0ad/data/l10n/ru.engine.po 8127458fec3a646de4b0d0746508bcf6807f284f9c0b8d092c88ed983483ce3f
SOURCE HOST /static/zero-ad/data/l10n/sk.engine.po /opt/0ad/data/l10n/sk.engine.po 130df26696f2f5a103ee1223ac931dc00edb84fb7c26e5e1159b7206a6fad527
SOURCE HOST /static/zero-ad/data/l10n/sv.engine.po /opt/0ad/data/l10n/sv.engine.po 3b4232796a9254ea6d41c1fbcc8e8ec82632ca95c5bbd6e9f250a9ad2aedfa89
SOURCE HOST /static/zero-ad/data/l10n/tr.engine.po /opt/0ad/data/l10n/tr.engine.po 0b0192793897e87ba2d5b60118711068c9b981de9c2d3788915af0f2b7376c17
SOURCE HOST /static/zero-ad/data/l10n/uk.engine.po /opt/0ad/data/l10n/uk.engine.po 303d5a0d4a33e0e3aba4e9434cad1441dc5b60192aa02dd7a5f4848108579726
SOURCE HOST /static/zero-ad/data/l10n/vi.engine.po /opt/0ad/data/l10n/vi.engine.po d78db32075c6f14986fb7dd15aef9c16bb403218cad2fac4d4d2a93d26573feb
SOURCE HOST /static/zero-ad/data/l10n/zh.engine.po /opt/0ad/data/l10n/zh.engine.po 83ba33b05a7de119d01d05792fb8d83065713c113c523fc4c9c6042619600f90
SOURCE HOST /static/zero-ad/data/l10n/zh_TW.engine.po /opt/0ad/data/l10n/zh_TW.engine.po 39d9eb57dd0295f4a019c9b6a3143043a9e484accc5d2b1c7a896c6fd17b7f79
SOURCE HOST /static/zero-ad/data/mods/mod/mod-000.zip /opt/0ad/data/mods/mod/mod-000.zip e23600212ae32103b233b60ef6fd9a50f8dbb3f613cd80e1ad8bf1b8cdc734e8
SOURCE HOST /static/zero-ad/data/mods/public/public-000.zip /opt/0ad/data/mods/public/public-000.zip fc4bc48ee7a68505a3fc172e0d6c9e8ffb3a5f671d757c8186d60058e8918964
SOURCE HOST /static/zero-ad/data/mods/public/public-001.zip /opt/0ad/data/mods/public/public-001.zip e0612417d231a9304a55ca502c7890bb7a9302764d648ffa4313a940ce7c71c5
SOURCE HOST /static/zero-ad/data/mods/public/public-002.zip /opt/0ad/data/mods/public/public-002.zip 34e3cec277ee1f08c38423302e366e54bbd325f5f19f9791e6f7d65c2da4667c
SOURCE HOST /static/zero-ad/data/mods/public/public-003.zip /opt/0ad/data/mods/public/public-003.zip 3fe4646263f9042869a6f5eb490c30901e13a3d441f5113af7fac0f892546e18
SOURCE HOST /static/zero-ad/data/mods/public/public-004.zip /opt/0ad/data/mods/public/public-004.zip cfa38de1f405d4eba7f1f43ecad03c48520e02d9556f0550163774c58adc3e6c
SOURCE HOST /static/zero-ad/data/mods/public/public-005.zip /opt/0ad/data/mods/public/public-005.zip 414a86c3e55c6edcaef489117c707b070adcc1d4d67c2fc79426a42ade875035
SOURCE HOST /static/zero-ad/data/mods/public/public-006.zip /opt/0ad/data/mods/public/public-006.zip 5c46ef9b0f15ccd189d7005903c2fec02d7a14fa4ad0cca962506513f2815bcc
SOURCE HOST /static/zero-ad/data/mods/public/public-007.zip /opt/0ad/data/mods/public/public-007.zip 566845c21fe76ba96f2b0579acba99cdf5d2e6021e652e63de56b3cca782f406
SOURCE HOST /static/zero-ad/data/mods/public/public-008.zip /opt/0ad/data/mods/public/public-008.zip 36073c28dc5423e2b62ca31aab341712365f4b6cbf776a912a2711ccc2b015b1
SOURCE HOST /static/zero-ad/data/mods/public/public-009.zip /opt/0ad/data/mods/public/public-009.zip db4c018a3e4623dbb131d98ed251df3da3dd63525a661197f646dc700d4edec6
SOURCE HOST /static/zero-ad/data/mods/public/public-010.zip /opt/0ad/data/mods/public/public-010.zip a198fbc3cec9c8fe78091e6400f0f084d7ea2c6ced42fbedec84cbbc91939da1
SOURCE HOST /static/zero-ad/data/mods/public/public-011.zip /opt/0ad/data/mods/public/public-011.zip a567ea655ca999568e4aba497f0a2dac94666feb7f909c19e40408ce398fcc4d
SOURCE HOST /static/zero-ad/data/mods/public/public-012.zip /opt/0ad/data/mods/public/public-012.zip 02a9840bd61137e99d9d19897f8f06b866ac41f4ff16a28e4fdab31a57fbdb97
SOURCE HOST /static/zero-ad/data/mods/public/public-013.zip /opt/0ad/data/mods/public/public-013.zip 6b0b3a884afcd8afbe1d003f8d2c778e710d4e4c825ff270ae99d0439122a464
SOURCE HOST /static/zero-ad/data/mods/public/public-014.zip /opt/0ad/data/mods/public/public-014.zip 495d85affdb774691b50292451cab9acfd42c0fc5d81f6b2e5224a33f084cc66
SOURCE HOST /static/zero-ad/data/mods/public/public-015.zip /opt/0ad/data/mods/public/public-015.zip ea98fd7d8e1510ae3b945017096856c2f34c1361a2f678311275c6eef8fff3bb
SOURCE HOST /static/zero-ad/data/mods/public/public-016.zip /opt/0ad/data/mods/public/public-016.zip 01d239bc33d768d340bb7af9ce00dc6486f45571e827e0c242b7e180cdc0bbc8
SOURCE HOST /static/zero-ad/data/mods/public/public-017.zip /opt/0ad/data/mods/public/public-017.zip 3746838e0338ca92c349d2621264e2b5fec9d756dee57716fa3b593f2a9e9e21
SOURCE HOST /static/zero-ad/data/mods/public/public-018.zip /opt/0ad/data/mods/public/public-018.zip 7816b3545863ce43a19d3a7bd7e891a3037acbd790eeb5a704a263dbd2630e1e
SOURCE HOST /static/zero-ad/data/mods/public/public-019.zip /opt/0ad/data/mods/public/public-019.zip 7ced7d5e7f6819403721a63b4778ac041ab8d1c444cac900c327c935b492f770
SOURCE HOST /static/zero-ad/data/mods/public/public-020.zip /opt/0ad/data/mods/public/public-020.zip f6ba9ea5278d4847832c78496ebefdcc9df444c903918084e48267acd24e7dd9
SOURCE HOST /static/zero-ad/data/mods/public/public-021.zip /opt/0ad/data/mods/public/public-021.zip fd0a1a9feb786a1f81d3001407704157aebf5a0612db55531c29f8110b47067d
SOURCE HOST /static/zero-ad/data/mods/public/public-022.zip /opt/0ad/data/mods/public/public-022.zip efc8f80ea16d520f9b0a0855494f18a78fa42f299c09f05034c1d6f7fb6b862d
SOURCE HOST /static/zero-ad/data/mods/public/public-023.zip /opt/0ad/data/mods/public/public-023.zip 6efacaf47524ab01dda4a6501c1ffe6c48c89f57823462a16002e2ee6ba8420e
SOURCE HOST /static/zero-ad/data/mods/public/public-024.zip /opt/0ad/data/mods/public/public-024.zip 26844880b6d5673361fd46c1b08e5c157e159959ce55b628bd10ead2e605f15b
SOURCE HOST /static/zero-ad/data/mods/public/public-025.zip /opt/0ad/data/mods/public/public-025.zip dfff42003e1a1f3fa6e3233e0701e202a291cc8f5e71c9ed147501c281f81666
SOURCE HOST /static/zero-ad/data/mods/public/public-026.zip /opt/0ad/data/mods/public/public-026.zip db0af640b6154beab7f2376ad87adab9bd22ddb58c66a8c5f48128b7490ae273
SOURCE HOST /static/zero-ad/licenses/ICU-LICENSE /opt/0ad/licenses/ICU-LICENSE f155f8f66833bdc8e0479656256bfac1d66a9ec9df4aa56292308f522b4e3fa7
SOURCE HOST /static/zero-ad/licenses/LICENSE.md /opt/0ad/licenses/LICENSE.md 956637a06a3cbddb79b0ea87b987cf9938c533412a71cfd74f261a399eb153eb
SOURCE HOST /static/zero-ad/licenses/OpenAL-Soft-COPYING /opt/0ad/licenses/OpenAL-Soft-COPYING d808ce217e5b611854da622b57ec29fe545584c48bc5352fae72a4b6e5074a15
SOURCE HOST /static/zero-ad/licenses/license_gpl-2.0.txt /opt/0ad/licenses/license_gpl-2.0.txt ab15fd526bd8dd18a9e77ebc139656bf4d33e97fc7238cd11bf60e2b9b8666c6
SOURCE HOST /static/zero-ad/licenses/license_lgpl-2.1.txt /opt/0ad/licenses/license_lgpl-2.1.txt c68fd1ffc1623ea0dace21abf57305818e4998a4ae0c79010aaaa943eb660b55
SOURCE HOST /static/zero-ad/licenses/license_mit.txt /opt/0ad/licenses/license_mit.txt 1969da35a4ec9d24f82280fe693d656d890ad61a8b477144e8184d0969463b08

FILE /usr/bin/zero-ad
    #!/bin/slop
    export ICU_DATA=/opt/0ad/data/icu
    /opt/0ad/system/pyrogenesis -writableRoot -mod=public -conf=hotkey.exit:Ctrl+F10 "$@"
SLOP /usr/bin/zero-ad -version
EXPORTS TOOL zero-ad
EXPORTS FOLDER zero-ad /opt/0ad
