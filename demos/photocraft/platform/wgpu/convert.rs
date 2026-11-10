//! wgpu's enumerations as gpu@0's (`host/gpu/dolly-gpu-0.wat`), by name: the numberings differ.
//! `None` is a value gpu@0 has no code for.

use wgt::{
    AddressMode, BlendFactor, BlendOperation, CompareFunction, FilterMode, IndexFormat,
    MipmapFilterMode, PrimitiveTopology, StencilOperation, TextureAspect, TextureDimension,
    TextureFormat, TextureSampleType, TextureViewDimension, VertexFormat,
};

pub fn texture_format(format: TextureFormat) -> Option<u32> {
    use TextureFormat as F;
    Some(match format {
        F::Rgba8Unorm => 1,
        F::Rgba8UnormSrgb => 2,
        F::R8Unorm => 3,
        F::Rg8Unorm => 4,
        F::Depth24PlusStencil8 => 5,
        F::Depth32Float => 6,
        F::Bc1RgbaUnorm => 7,
        F::Bc2RgbaUnorm => 8,
        F::Bc3RgbaUnorm => 9,
        F::R8Snorm => 10,
        F::R8Uint => 11,
        F::R8Sint => 12,
        F::R16Uint => 13,
        F::R16Sint => 14,
        F::R16Float => 15,
        F::Rg8Snorm => 16,
        F::Rg8Uint => 17,
        F::Rg8Sint => 18,
        F::R32Uint => 19,
        F::R32Sint => 20,
        F::R32Float => 21,
        F::Rg16Uint => 22,
        F::Rg16Sint => 23,
        F::Rg16Float => 24,
        F::Rgba8Snorm => 25,
        F::Rgba8Uint => 26,
        F::Rgba8Sint => 27,
        F::Bgra8Unorm => 28,
        F::Bgra8UnormSrgb => 29,
        F::Rgb9e5Ufloat => 30,
        F::Rgb10a2Uint => 31,
        F::Rgb10a2Unorm => 32,
        F::Rg11b10Ufloat => 33,
        F::Rg32Uint => 34,
        F::Rg32Sint => 35,
        F::Rg32Float => 36,
        F::Rgba16Uint => 37,
        F::Rgba16Sint => 38,
        F::Rgba16Float => 39,
        F::Rgba32Uint => 40,
        F::Rgba32Sint => 41,
        F::Rgba32Float => 42,
        F::Stencil8 => 43,
        F::Depth16Unorm => 44,
        F::Depth32FloatStencil8 => 45,
        F::Bc1RgbaUnormSrgb => 46,
        F::Bc2RgbaUnormSrgb => 47,
        F::Bc3RgbaUnormSrgb => 48,
        F::Bc4RUnorm => 49,
        F::Bc4RSnorm => 50,
        F::Bc5RgUnorm => 51,
        F::Bc5RgSnorm => 52,
        F::Bc6hRgbUfloat => 53,
        F::Bc6hRgbFloat => 54,
        F::Bc7RgbaUnorm => 55,
        F::Bc7RgbaUnormSrgb => 56,
        F::R16Unorm => 57,
        F::R16Snorm => 58,
        F::Rg16Unorm => 59,
        F::Rg16Snorm => 60,
        F::Rgba16Unorm => 61,
        F::Rgba16Snorm => 62,
        _ => return None,
    })
}

pub fn vertex_format(format: VertexFormat) -> Option<u32> {
    use VertexFormat as V;
    Some(match format {
        V::Float32 => 1,
        V::Float32x2 => 2,
        V::Float32x3 => 3,
        V::Float32x4 => 4,
        V::Unorm8x4 => 5,
        V::Snorm8x4 => 6,
        V::Uint8x4 => 7,
        V::Sint8x4 => 8,
        V::Unorm16x2 => 9,
        V::Unorm16x4 => 10,
        V::Uint16x2 => 11,
        V::Uint16x4 => 12,
        V::Float16x2 => 13,
        V::Float16x4 => 14,
        V::Uint8x2 => 15,
        V::Sint8x2 => 16,
        V::Unorm8x2 => 17,
        V::Snorm8x2 => 18,
        V::Sint16x2 => 19,
        V::Sint16x4 => 20,
        V::Snorm16x2 => 21,
        V::Snorm16x4 => 22,
        V::Uint32 => 23,
        V::Uint32x2 => 24,
        V::Uint32x3 => 25,
        V::Uint32x4 => 26,
        V::Sint32 => 27,
        V::Sint32x2 => 28,
        V::Sint32x3 => 29,
        V::Sint32x4 => 30,
        V::Unorm10_10_10_2 => 31,
        _ => return None,
    })
}

pub fn blend_factor(factor: BlendFactor) -> Option<u32> {
    use BlendFactor as B;
    Some(match factor {
        B::Zero => 0,
        B::One => 1,
        B::Src => 2,
        B::OneMinusSrc => 3,
        B::Dst => 4,
        B::OneMinusDst => 5,
        B::SrcAlpha => 6,
        B::OneMinusSrcAlpha => 7,
        B::DstAlpha => 8,
        B::OneMinusDstAlpha => 9,
        B::SrcAlphaSaturated => 10,
        B::Constant => 11,
        B::OneMinusConstant => 12,
        _ => return None,
    })
}

pub fn blend_operation(operation: BlendOperation) -> u32 {
    match operation {
        BlendOperation::Add => 0,
        BlendOperation::Subtract => 1,
        BlendOperation::ReverseSubtract => 2,
        BlendOperation::Min => 3,
        BlendOperation::Max => 4,
    }
}

pub fn compare(function: CompareFunction) -> u32 {
    match function {
        CompareFunction::Never => 1,
        CompareFunction::Less => 2,
        CompareFunction::Equal => 3,
        CompareFunction::LessEqual => 4,
        CompareFunction::Greater => 5,
        CompareFunction::NotEqual => 6,
        CompareFunction::GreaterEqual => 7,
        CompareFunction::Always => 8,
    }
}

pub fn stencil_operation(operation: StencilOperation) -> u32 {
    match operation {
        StencilOperation::Keep => 0,
        StencilOperation::Zero => 1,
        StencilOperation::Replace => 2,
        StencilOperation::Invert => 3,
        StencilOperation::IncrementClamp => 4,
        StencilOperation::DecrementClamp => 5,
        StencilOperation::IncrementWrap => 6,
        StencilOperation::DecrementWrap => 7,
    }
}

pub fn topology(topology: PrimitiveTopology) -> u32 {
    match topology {
        PrimitiveTopology::TriangleList => 0,
        PrimitiveTopology::TriangleStrip => 1,
        PrimitiveTopology::LineList => 2,
        PrimitiveTopology::LineStrip => 3,
        PrimitiveTopology::PointList => 4,
    }
}

pub fn index_format(format: IndexFormat) -> u32 {
    match format {
        IndexFormat::Uint16 => 1,
        IndexFormat::Uint32 => 2,
    }
}

pub fn view_dimension(dimension: TextureViewDimension) -> u32 {
    match dimension {
        TextureViewDimension::D1 => 1,
        TextureViewDimension::D2 => 2,
        TextureViewDimension::D2Array => 3,
        TextureViewDimension::Cube => 4,
        TextureViewDimension::CubeArray => 5,
        TextureViewDimension::D3 => 6,
    }
}

/// TEXTURE's dimension field: one-, two- or three-dimensional, layers then being array layers or
/// depth.
pub fn texture_dimension(dimension: TextureDimension) -> u32 {
    match dimension {
        TextureDimension::D1 => 1,
        TextureDimension::D2 => 2,
        TextureDimension::D3 => 3,
    }
}

pub fn aspect(aspect: TextureAspect) -> Option<u32> {
    Some(match aspect {
        TextureAspect::All => 0,
        TextureAspect::StencilOnly => 1,
        TextureAspect::DepthOnly => 2,
        _ => return None,
    })
}

pub fn sample_type(sample_type: TextureSampleType) -> u32 {
    match sample_type {
        TextureSampleType::Float { filterable: true } => 1,
        TextureSampleType::Float { filterable: false } => 2,
        TextureSampleType::Depth => 3,
        TextureSampleType::Sint => 4,
        TextureSampleType::Uint => 5,
    }
}

pub fn filter(mode: FilterMode) -> u32 {
    match mode {
        FilterMode::Nearest => 0,
        FilterMode::Linear => 1,
    }
}

pub fn mipmap_filter(mode: MipmapFilterMode) -> u32 {
    match mode {
        MipmapFilterMode::Nearest => 0,
        MipmapFilterMode::Linear => 1,
    }
}

/// Clamp to a border colour is not WebGPU's.
pub fn address(mode: AddressMode) -> Option<u32> {
    Some(match mode {
        AddressMode::ClampToEdge => 0,
        AddressMode::Repeat => 1,
        AddressMode::MirrorRepeat => 2,
        AddressMode::ClampToBorder => return None,
    })
}

/// LIMITS's feature bits, in its order, and the wgpu features they grant.
pub const FEATURES: [(u64, wgt::Features); 9] = [
    (1, wgt::Features::DEPTH_CLIP_CONTROL),
    (2, wgt::Features::DEPTH32FLOAT_STENCIL8),
    (4, wgt::Features::TEXTURE_COMPRESSION_BC),
    (16, wgt::Features::INDIRECT_FIRST_INSTANCE),
    (32, wgt::Features::SHADER_F16),
    (64, wgt::Features::RG11B10UFLOAT_RENDERABLE),
    (128, wgt::Features::FLOAT32_FILTERABLE),
    (256, wgt::Features::FLOAT32_BLENDABLE),
    (2048, wgt::Features::TEXTURE_FORMAT_16BIT_NORM),
];

/// LIMITS's reply: features, then the limits in this order.
pub fn limits(reply: &[u64; 35]) -> wgt::Limits {
    let u = |index: usize| reply[index].min(u32::MAX as u64) as u32;
    let defaults = wgt::Limits::default();
    wgt::Limits {
        max_texture_dimension_1d: u(1),
        max_texture_dimension_2d: u(2),
        max_texture_dimension_3d: u(3),
        max_texture_array_layers: u(4),
        max_bind_groups: u(5),
        // WebGPU's default; LIMITS does not report it.
        max_bind_groups_plus_vertex_buffers: 24,
        max_bindings_per_bind_group: u(6),
        max_dynamic_uniform_buffers_per_pipeline_layout: u(7),
        max_dynamic_storage_buffers_per_pipeline_layout: u(8),
        max_sampled_textures_per_shader_stage: u(9),
        max_samplers_per_shader_stage: u(10),
        max_storage_buffers_per_shader_stage: u(11),
        max_storage_textures_per_shader_stage: u(12),
        max_uniform_buffers_per_shader_stage: u(13),
        max_binding_array_elements_per_shader_stage: 0,
        max_binding_array_sampler_elements_per_shader_stage: 0,
        max_binding_array_acceleration_structure_elements_per_shader_stage: 0,
        max_uniform_buffer_binding_size: reply[14],
        max_storage_buffer_binding_size: reply[15],
        min_uniform_buffer_offset_alignment: u(16),
        min_storage_buffer_offset_alignment: u(17),
        max_vertex_buffers: u(18),
        max_buffer_size: reply[19],
        max_vertex_attributes: u(20),
        max_vertex_buffer_array_stride: u(21),
        max_inter_stage_shader_variables: u(22),
        max_color_attachments: u(23),
        max_color_attachment_bytes_per_sample: u(24),
        max_compute_workgroup_storage_size: u(25),
        max_compute_invocations_per_workgroup: u(26),
        max_compute_workgroup_size_x: u(27),
        max_compute_workgroup_size_y: u(28),
        max_compute_workgroup_size_z: u(29),
        max_compute_workgroups_per_dimension: u(30),
        max_immediate_size: 0,
        ..defaults
    }
}
