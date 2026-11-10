//! Command encoders, passes and bundles: their records wait in the command buffer until it is
//! submitted, with the objects they name.

use alloc::{sync::Arc, vec::Vec};
use core::ops::Range;
use std::sync::Mutex;

use super::{
    convert, op, DollyBindGroup, DollyBuffer, DollyComputePipeline, DollyQuerySet, DollyRenderPipeline,
    DollyTexture, DollyTextureView, Gpu, Keep, Record,
};
use crate::dispatch;

#[derive(Debug, Default)]
pub struct Commands {
    records: Vec<Record>,
    keep: Vec<Keep>,
}

impl core::fmt::Debug for Record {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "Record({} bytes)", self.0.len())
    }
}

impl Commands {
    fn push(&mut self, record: Record) {
        self.records.push(record);
    }

    fn set_bind_group(&mut self, index: u32, bind_group: Option<&dispatch::DispatchBindGroup>, offsets: &[u32]) {
        // An unset group is not drawn with; gpu@0 names only groups.
        let Some(group) = bind_group else { return };
        let group = group.as_custom::<DollyBindGroup>().unwrap();
        let mut record = Record::new(op::SET_BIND_GROUP, 24 + 4 * offsets.len());
        record.u64(8, group.object.handle).u32(16, index).u32(20, offsets.len() as u32);
        for (at, offset) in offsets.iter().enumerate() {
            record.u32(24 + 4 * at, *offset);
        }
        self.keep.push(group.object.clone());
        self.keep.extend(group.keep.iter().cloned());
        self.push(record);
    }

    fn buffer(&mut self, buffer: &dispatch::DispatchBuffer) -> (u64, u64) {
        let buffer = buffer.as_custom::<DollyBuffer>().unwrap();
        self.keep.push(buffer.object.clone());
        (buffer.object.handle, buffer.size)
    }

    fn set_render_pipeline(&mut self, pipeline: &dispatch::DispatchRenderPipeline) {
        let pipeline = pipeline.as_custom::<DollyRenderPipeline>().unwrap();
        let mut record = Record::new(op::SET_PIPELINE, 16);
        record.u64(8, pipeline.object.handle);
        self.keep.push(pipeline.object.clone());
        self.push(record);
    }

    fn set_vertex_buffer(&mut self, slot: u32, buffer: Option<&dispatch::DispatchBuffer>, offset: u64, size: Option<wgt::BufferSize>) {
        let Some(buffer) = buffer else { return };
        let (handle, buffer_size) = self.buffer(buffer);
        let size = size.map_or(buffer_size.saturating_sub(offset), |size| size.get());
        let mut record = Record::new(op::SET_VERTEX_BUFFER, 40);
        record.u64(8, handle).u32(16, slot).u64(24, offset).u64(32, size);
        self.push(record);
    }

    fn set_index_buffer(&mut self, buffer: &dispatch::DispatchBuffer, format: wgt::IndexFormat, offset: u64, size: Option<wgt::BufferSize>) {
        let (handle, buffer_size) = self.buffer(buffer);
        let size = size.map_or(buffer_size.saturating_sub(offset), |size| size.get());
        let mut record = Record::new(op::SET_INDEX_BUFFER, 40);
        record.u64(8, handle).u32(16, convert::index_format(format)).u64(24, offset).u64(32, size);
        self.push(record);
    }

    fn draw(&mut self, vertices: Range<u32>, instances: Range<u32>) {
        let mut record = Record::new(op::DRAW, 24);
        record
            .u32(8, vertices.end - vertices.start)
            .u32(12, instances.end - instances.start)
            .u32(16, vertices.start)
            .u32(20, instances.start);
        self.push(record);
    }

    fn draw_indexed(&mut self, indices: Range<u32>, base_vertex: i32, instances: Range<u32>) {
        let mut record = Record::new(op::DRAW_INDEXED, 32);
        record
            .u32(8, indices.end - indices.start)
            .u32(12, instances.end - instances.start)
            .u32(16, indices.start)
            .i32(20, base_vertex)
            .u32(24, instances.start);
        self.push(record);
    }

    fn indirect(&mut self, opcode: u32, buffer: &dispatch::DispatchBuffer, offset: u64) {
        let (handle, _) = self.buffer(buffer);
        let mut record = Record::new(opcode, 24);
        record.u64(8, handle).u64(16, offset);
        self.push(record);
    }
}

fn unsupported(gpu: &Gpu, what: &str) {
    gpu.validation(alloc::format!("gpu@0 has no {what}"));
}

#[derive(Debug)]
pub struct DollyCommandEncoder {
    gpu: Arc<Gpu>,
    commands: Arc<Mutex<Commands>>,
}

impl DollyCommandEncoder {
    pub(crate) fn new(gpu: Arc<Gpu>) -> Self {
        Self { gpu, commands: Arc::default() }
    }

    fn texture_copy(&self, record: &mut Record, at: usize, copy: &crate::TexelCopyTextureInfo<'_>) -> Option<Keep> {
        let texture = copy.texture.inner.as_custom::<DollyTexture>().unwrap();
        if texture.info.surface {
            unsupported(&self.gpu, "copies of the surface");
            return None;
        }
        record.u64(at, texture.info.object.handle);
        Some(texture.info.object.clone())
    }

    fn buffer_texture_copy(
        &self,
        opcode: u32,
        buffer: &crate::TexelCopyBufferInfo<'_>,
        texture: &crate::TexelCopyTextureInfo<'_>,
        size: crate::Extent3d,
    ) {
        let info = &texture.texture.inner.as_custom::<DollyTexture>().unwrap().info;
        let (block_width, block_height) = info.format.block_dimensions();
        let block_bytes = info.format.block_copy_size(Some(texture.aspect)).unwrap_or(4);
        // A single row's layout may be left out; gpu@0 takes WebGPU's alignment of rows.
        let row_bytes = size.width.div_ceil(block_width) * block_bytes;
        let bytes_per_row = buffer.layout.bytes_per_row.unwrap_or(row_bytes.next_multiple_of(256));
        let rows_per_image = buffer.layout.rows_per_image.unwrap_or(size.height.div_ceil(block_height));
        let aspect = convert::aspect(texture.aspect).unwrap_or(0);
        let mut record = Record::new(opcode, 72);
        record
            .u64(16, buffer.layout.offset)
            .u32(24, bytes_per_row)
            .u32(28, rows_per_image)
            .u32(40, texture.mip_level)
            .u32(44, aspect)
            .u32(48, texture.origin.x)
            .u32(52, texture.origin.y)
            .u32(56, texture.origin.z)
            .u32(60, size.width)
            .u32(64, size.height)
            .u32(68, size.depth_or_array_layers);
        let Some(keep) = self.texture_copy(&mut record, 32, texture) else { return };
        let mut commands = self.commands.lock().unwrap();
        let (handle, _) = commands.buffer(&buffer.buffer.inner);
        record.u64(8, handle);
        commands.keep.push(keep);
        commands.push(record);
    }
}

impl dispatch::CommandEncoderInterface for DollyCommandEncoder {
    fn copy_buffer_to_buffer(
        &self,
        source: &dispatch::DispatchBuffer,
        source_offset: crate::BufferAddress,
        destination: &dispatch::DispatchBuffer,
        destination_offset: crate::BufferAddress,
        copy_size: Option<crate::BufferAddress>,
    ) {
        let mut commands = self.commands.lock().unwrap();
        let (source, source_size) = commands.buffer(source);
        let (destination, _) = commands.buffer(destination);
        let bytes = copy_size.unwrap_or(source_size.saturating_sub(source_offset));
        let mut record = Record::new(op::COPY_BUFFER, 48);
        record
            .u64(8, source)
            .u64(16, destination)
            .u64(24, source_offset)
            .u64(32, destination_offset)
            .u64(40, bytes);
        commands.push(record);
    }

    fn copy_buffer_to_texture(
        &self,
        source: crate::TexelCopyBufferInfo<'_>,
        destination: crate::TexelCopyTextureInfo<'_>,
        copy_size: crate::Extent3d,
    ) {
        self.buffer_texture_copy(op::COPY_BUFFER_TO_TEXTURE, &source, &destination, copy_size);
    }

    fn copy_texture_to_buffer(
        &self,
        source: crate::TexelCopyTextureInfo<'_>,
        destination: crate::TexelCopyBufferInfo<'_>,
        copy_size: crate::Extent3d,
    ) {
        self.buffer_texture_copy(op::COPY_TEXTURE_TO_BUFFER, &destination, &source, copy_size);
    }

    fn copy_texture_to_texture(
        &self,
        source: crate::TexelCopyTextureInfo<'_>,
        destination: crate::TexelCopyTextureInfo<'_>,
        copy_size: crate::Extent3d,
    ) {
        let mut record = Record::new(op::COPY_TEXTURE_TO_TEXTURE, 72);
        record
            .u32(24, source.mip_level)
            .u32(28, source.origin.x)
            .u32(32, source.origin.y)
            .u32(36, source.origin.z)
            .u32(40, destination.mip_level)
            .u32(44, destination.origin.x)
            .u32(48, destination.origin.y)
            .u32(52, destination.origin.z)
            .u32(56, copy_size.width)
            .u32(60, copy_size.height)
            .u32(64, copy_size.depth_or_array_layers);
        let (Some(source), Some(destination)) =
            (self.texture_copy(&mut record, 8, &source), self.texture_copy(&mut record, 16, &destination))
        else {
            return;
        };
        let mut commands = self.commands.lock().unwrap();
        commands.keep.extend([source, destination]);
        commands.push(record);
    }

    fn begin_compute_pass(&self, desc: &crate::ComputePassDescriptor<'_>) -> dispatch::DispatchComputePass {
        if desc.timestamp_writes.is_some() {
            unsupported(&self.gpu, "pass timestamps");
        }
        self.commands.lock().unwrap().push(Record::new(op::BEGIN_COMPUTE_PASS, 8));
        dispatch::DispatchComputePass::custom(DollyComputePass { gpu: self.gpu.clone(), commands: self.commands.clone() })
    }

    fn begin_render_pass(&self, desc: &crate::RenderPassDescriptor<'_>) -> dispatch::DispatchRenderPass {
        if desc.timestamp_writes.is_some() || desc.occlusion_query_set.is_some() {
            unsupported(&self.gpu, "pass queries");
        }
        let attachments = desc.color_attachments;
        let mut record = Record::new(op::BEGIN_VIEW_PASS, 64 + 40 * attachments.len());
        let mut commands = self.commands.lock().unwrap();
        let mut size = None;
        let mut absent = 0u32;
        for (index, attachment) in attachments.iter().enumerate() {
            let at = 64 + 40 * index;
            let Some(attachment) = attachment else {
                absent |= 1 << index;
                continue;
            };
            let view = attachment.view.inner.as_custom::<DollyTextureView>().unwrap();
            size.get_or_insert((view.width, view.height));
            if view.texture.surface {
                record.u32(20, view.width).u32(24, view.height);
            }
            commands.keep.push(view.object.clone());
            record.u64(at, view.object.handle);
            if let Some(resolve) = attachment.resolve_target {
                let resolve = resolve.inner.as_custom::<DollyTextureView>().unwrap();
                commands.keep.push(resolve.object.clone());
                record.u64(at + 8, resolve.object.handle);
            }
            let clear = match attachment.ops.load {
                crate::LoadOp::Load => None,
                crate::LoadOp::Clear(color) => Some(color),
                crate::LoadOp::DontCare(_) => Some(crate::Color::BLACK),
            };
            record
                .u32(at + 16, clear.is_some() as u32)
                .u32(at + 20, matches!(attachment.ops.store, crate::StoreOp::Discard) as u32);
            if let Some(color) = clear {
                record
                    .f32(at + 24, color.r as f32)
                    .f32(at + 28, color.g as f32)
                    .f32(at + 32, color.b as f32)
                    .f32(at + 36, color.a as f32);
            }
        }
        record.u32(16, attachments.len() as u32).u32(60, absent);
        if let Some(depth) = &desc.depth_stencil_attachment {
            let view = depth.view.inner.as_custom::<DollyTextureView>().unwrap();
            size.get_or_insert((view.width, view.height));
            commands.keep.push(view.object.clone());
            record.u64(8, view.object.handle);
            match &depth.depth_ops {
                Some(ops) => {
                    let clear = match ops.load {
                        crate::LoadOp::Load => None,
                        crate::LoadOp::Clear(value) => Some(value),
                        crate::LoadOp::DontCare(_) => Some(1.0),
                    };
                    record
                        .u32(28, clear.is_some() as u32)
                        .u32(32, matches!(ops.store, crate::StoreOp::Discard) as u32)
                        .f32(40, clear.unwrap_or(0.0));
                },
                None => {
                    record.u32(36, 1);
                },
            }
            match &depth.stencil_ops {
                Some(ops) => {
                    let clear = match ops.load {
                        crate::LoadOp::Load => None,
                        crate::LoadOp::Clear(value) => Some(value),
                        crate::LoadOp::DontCare(_) => Some(0),
                    };
                    record
                        .u32(44, clear.is_some() as u32)
                        .u32(48, matches!(ops.store, crate::StoreOp::Discard) as u32)
                        .u32(56, clear.unwrap_or(0));
                },
                None => {
                    record.u32(52, 1);
                },
            }
        }
        commands.push(record);
        let (width, height) = size.unwrap_or((1, 1));
        dispatch::DispatchRenderPass::custom(DollyRenderPass {
            gpu: self.gpu.clone(),
            commands: self.commands.clone(),
            viewport: [0.0, 0.0, width as f32, height as f32, 0.0, 1.0],
            scissor: [0, 0, width, height],
        })
    }

    fn finish(&mut self) -> dispatch::DispatchCommandBuffer {
        let commands = core::mem::take(&mut *self.commands.lock().unwrap());
        dispatch::DispatchCommandBuffer::custom(DollyCommandBuffer { records: commands.records, keep: commands.keep })
    }

    fn clear_texture(&self, _texture: &dispatch::DispatchTexture, _subresource_range: &crate::ImageSubresourceRange) {
        unsupported(&self.gpu, "texture clears");
    }

    fn clear_buffer(&self, buffer: &dispatch::DispatchBuffer, offset: crate::BufferAddress, size: Option<crate::BufferAddress>) {
        let mut commands = self.commands.lock().unwrap();
        let (handle, buffer_size) = commands.buffer(buffer);
        let mut record = Record::new(op::CLEAR_BUFFER, 32);
        record.u64(8, handle).u64(16, offset).u64(24, size.unwrap_or(buffer_size.saturating_sub(offset)));
        commands.push(record);
    }

    fn insert_debug_marker(&self, _label: &str) {}

    fn push_debug_group(&self, _label: &str) {}

    fn pop_debug_group(&self) {}

    fn write_timestamp(&self, query_set: &dispatch::DispatchQuerySet, query_index: u32) {
        let query_set = query_set.as_custom::<DollyQuerySet>().unwrap();
        let mut record = Record::new(op::WRITE_TIMESTAMP, 24);
        record.u64(8, query_set.object.handle).u32(16, query_index);
        let mut commands = self.commands.lock().unwrap();
        commands.keep.push(query_set.object.clone());
        commands.push(record);
    }

    fn resolve_query_set(
        &self,
        query_set: &dispatch::DispatchQuerySet,
        first_query: u32,
        query_count: u32,
        destination: &dispatch::DispatchBuffer,
        destination_offset: crate::BufferAddress,
    ) {
        let query_set = query_set.as_custom::<DollyQuerySet>().unwrap();
        let mut commands = self.commands.lock().unwrap();
        let (destination, _) = commands.buffer(destination);
        let mut record = Record::new(op::RESOLVE_QUERY_SET, 40);
        record
            .u64(8, query_set.object.handle)
            .u32(16, first_query)
            .u32(20, query_count)
            .u64(24, destination)
            .u64(32, destination_offset);
        commands.keep.push(query_set.object.clone());
        commands.push(record);
    }

    fn mark_acceleration_structures_built<'a>(
        &self,
        _blas: &mut dyn Iterator<Item = &'a crate::Blas>,
        _tlas: &mut dyn Iterator<Item = &'a crate::Tlas>,
    ) {
        unimplemented!("gpu@0 has no ray tracing");
    }

    fn build_acceleration_structures<'a>(
        &self,
        _blas: &mut dyn Iterator<Item = &'a crate::BlasBuildEntry<'a>>,
        _tlas: &mut dyn Iterator<Item = &'a crate::Tlas>,
    ) {
        unimplemented!("gpu@0 has no ray tracing");
    }

    /// WebGPU tracks its resources' states itself.
    fn transition_resources<'a>(
        &mut self,
        _buffer_transitions: &mut dyn Iterator<Item = wgt::BufferTransition<&'a dispatch::DispatchBuffer>>,
        _texture_transitions: &mut dyn Iterator<Item = wgt::TextureTransition<&'a dispatch::DispatchTexture>>,
    ) {
    }
}

#[derive(Debug)]
pub struct DollyCommandBuffer {
    pub(crate) records: Vec<Record>,
    keep: Vec<Keep>,
}

impl dispatch::CommandBufferInterface for DollyCommandBuffer {}

#[derive(Debug)]
pub struct DollyComputePass {
    gpu: Arc<Gpu>,
    commands: Arc<Mutex<Commands>>,
}

impl Drop for DollyComputePass {
    fn drop(&mut self) {
        self.commands.lock().unwrap().push(Record::new(op::END_COMPUTE_PASS, 8));
    }
}

impl dispatch::ComputePassInterface for DollyComputePass {
    fn set_pipeline(&mut self, pipeline: &dispatch::DispatchComputePipeline) {
        let pipeline = pipeline.as_custom::<DollyComputePipeline>().unwrap();
        let mut record = Record::new(op::SET_PIPELINE, 16);
        record.u64(8, pipeline.object.handle);
        let mut commands = self.commands.lock().unwrap();
        commands.keep.push(pipeline.object.clone());
        commands.push(record);
    }

    fn set_bind_group(&mut self, index: u32, bind_group: Option<&dispatch::DispatchBindGroup>, offsets: &[crate::DynamicOffset]) {
        self.commands.lock().unwrap().set_bind_group(index, bind_group, offsets);
    }

    fn set_immediates(&mut self, _offset: u32, _data: &[u8]) {
        unsupported(&self.gpu, "immediates");
    }

    fn insert_debug_marker(&mut self, _label: &str) {}

    fn push_debug_group(&mut self, _group_label: &str) {}

    fn pop_debug_group(&mut self) {}

    fn write_timestamp(&mut self, _query_set: &dispatch::DispatchQuerySet, _query_index: u32) {
        unsupported(&self.gpu, "timestamps inside passes");
    }

    fn begin_pipeline_statistics_query(&mut self, _query_set: &dispatch::DispatchQuerySet, _query_index: u32) {
        unsupported(&self.gpu, "pipeline statistics");
    }

    fn end_pipeline_statistics_query(&mut self) {}

    fn dispatch_workgroups(&mut self, x: u32, y: u32, z: u32) {
        let mut record = Record::new(op::DISPATCH, 24);
        record.u32(8, x).u32(12, y).u32(16, z);
        self.commands.lock().unwrap().push(record);
    }

    fn dispatch_workgroups_indirect(&mut self, indirect_buffer: &dispatch::DispatchBuffer, indirect_offset: crate::BufferAddress) {
        self.commands.lock().unwrap().indirect(op::DISPATCH_INDIRECT, indirect_buffer, indirect_offset);
    }

    fn transition_resources<'a>(
        &mut self,
        _buffer_transitions: &mut dyn Iterator<Item = wgt::BufferTransition<&'a dispatch::DispatchBuffer>>,
        _texture_transitions: &mut dyn Iterator<Item = wgt::TextureTransition<&'a dispatch::DispatchTextureView>>,
    ) {
    }
}

#[derive(Debug)]
pub struct DollyRenderPass {
    gpu: Arc<Gpu>,
    commands: Arc<Mutex<Commands>>,
    viewport: [f32; 6],
    scissor: [u32; 4],
}

impl DollyRenderPass {
    /// gpu@0 sets the viewport and the scissor rectangle together.
    fn set_viewport_and_scissor(&mut self) {
        let mut record = Record::new(op::VIEWPORT, 48);
        for (index, value) in self.viewport.iter().enumerate() {
            record.f32(8 + 4 * index, *value);
        }
        for (index, value) in self.scissor.iter().enumerate() {
            record.u32(32 + 4 * index, *value);
        }
        self.commands.lock().unwrap().push(record);
    }
}

impl Drop for DollyRenderPass {
    fn drop(&mut self) {
        self.commands.lock().unwrap().push(Record::new(op::END_RENDER_PASS, 8));
    }
}

impl dispatch::RenderPassInterface for DollyRenderPass {
    fn set_pipeline(&mut self, pipeline: &dispatch::DispatchRenderPipeline) {
        self.commands.lock().unwrap().set_render_pipeline(pipeline);
    }

    fn set_bind_group(&mut self, index: u32, bind_group: Option<&dispatch::DispatchBindGroup>, offsets: &[crate::DynamicOffset]) {
        self.commands.lock().unwrap().set_bind_group(index, bind_group, offsets);
    }

    fn set_index_buffer(
        &mut self,
        buffer: &dispatch::DispatchBuffer,
        index_format: crate::IndexFormat,
        offset: crate::BufferAddress,
        size: Option<crate::BufferSize>,
    ) {
        self.commands.lock().unwrap().set_index_buffer(buffer, index_format, offset, size);
    }

    fn set_vertex_buffer(
        &mut self,
        slot: u32,
        buffer: Option<&dispatch::DispatchBuffer>,
        offset: crate::BufferAddress,
        size: Option<crate::BufferSize>,
    ) {
        self.commands.lock().unwrap().set_vertex_buffer(slot, buffer, offset, size);
    }

    fn set_immediates(&mut self, _offset: u32, _data: &[u8]) {
        unsupported(&self.gpu, "immediates");
    }

    fn set_blend_constant(&mut self, color: crate::Color) {
        let mut record = Record::new(op::SET_BLEND_CONSTANT, 24);
        record.f32(8, color.r as f32).f32(12, color.g as f32).f32(16, color.b as f32).f32(20, color.a as f32);
        self.commands.lock().unwrap().push(record);
    }

    fn set_scissor_rect(&mut self, x: u32, y: u32, width: u32, height: u32) {
        self.scissor = [x, y, width, height];
        self.set_viewport_and_scissor();
    }

    fn set_viewport(&mut self, x: f32, y: f32, width: f32, height: f32, min_depth: f32, max_depth: f32) {
        self.viewport = [x, y, width, height, min_depth, max_depth];
        self.set_viewport_and_scissor();
    }

    fn set_stencil_reference(&mut self, reference: u32) {
        let mut record = Record::new(op::SET_STENCIL_REFERENCE, 16);
        record.u32(8, reference);
        self.commands.lock().unwrap().push(record);
    }

    fn draw(&mut self, vertices: Range<u32>, instances: Range<u32>) {
        self.commands.lock().unwrap().draw(vertices, instances);
    }

    fn draw_indexed(&mut self, indices: Range<u32>, base_vertex: i32, instances: Range<u32>) {
        self.commands.lock().unwrap().draw_indexed(indices, base_vertex, instances);
    }

    fn draw_mesh_tasks(&mut self, _group_count_x: u32, _group_count_y: u32, _group_count_z: u32) {
        unimplemented!("gpu@0 has no mesh shaders");
    }

    fn draw_indirect(&mut self, indirect_buffer: &dispatch::DispatchBuffer, indirect_offset: crate::BufferAddress) {
        self.commands.lock().unwrap().indirect(op::DRAW_INDIRECT, indirect_buffer, indirect_offset);
    }

    fn draw_indexed_indirect(&mut self, indirect_buffer: &dispatch::DispatchBuffer, indirect_offset: crate::BufferAddress) {
        self.commands.lock().unwrap().indirect(op::DRAW_INDEXED_INDIRECT, indirect_buffer, indirect_offset);
    }

    fn draw_mesh_tasks_indirect(&mut self, _indirect_buffer: &dispatch::DispatchBuffer, _indirect_offset: crate::BufferAddress) {
        unimplemented!("gpu@0 has no mesh shaders");
    }

    /// One indirect draw after another, as WebGPU has no multiple draws.
    fn multi_draw_indirect(&mut self, indirect_buffer: &dispatch::DispatchBuffer, indirect_offset: crate::BufferAddress, count: u32) {
        let mut commands = self.commands.lock().unwrap();
        for index in 0..count as u64 {
            commands.indirect(op::DRAW_INDIRECT, indirect_buffer, indirect_offset + 16 * index);
        }
    }

    fn multi_draw_indexed_indirect(
        &mut self,
        indirect_buffer: &dispatch::DispatchBuffer,
        indirect_offset: crate::BufferAddress,
        count: u32,
    ) {
        let mut commands = self.commands.lock().unwrap();
        for index in 0..count as u64 {
            commands.indirect(op::DRAW_INDEXED_INDIRECT, indirect_buffer, indirect_offset + 20 * index);
        }
    }

    fn multi_draw_indirect_count(
        &mut self,
        _indirect_buffer: &dispatch::DispatchBuffer,
        _indirect_offset: crate::BufferAddress,
        _count_buffer: &dispatch::DispatchBuffer,
        _count_buffer_offset: crate::BufferAddress,
        _max_count: u32,
    ) {
        unsupported(&self.gpu, "draw counts in buffers");
    }

    fn multi_draw_mesh_tasks_indirect(
        &mut self,
        _indirect_buffer: &dispatch::DispatchBuffer,
        _indirect_offset: crate::BufferAddress,
        _count: u32,
    ) {
        unimplemented!("gpu@0 has no mesh shaders");
    }

    fn multi_draw_indexed_indirect_count(
        &mut self,
        _indirect_buffer: &dispatch::DispatchBuffer,
        _indirect_offset: crate::BufferAddress,
        _count_buffer: &dispatch::DispatchBuffer,
        _count_buffer_offset: crate::BufferAddress,
        _max_count: u32,
    ) {
        unsupported(&self.gpu, "draw counts in buffers");
    }

    fn multi_draw_mesh_tasks_indirect_count(
        &mut self,
        _indirect_buffer: &dispatch::DispatchBuffer,
        _indirect_offset: crate::BufferAddress,
        _count_buffer: &dispatch::DispatchBuffer,
        _count_buffer_offset: crate::BufferAddress,
        _max_count: u32,
    ) {
        unimplemented!("gpu@0 has no mesh shaders");
    }

    fn insert_debug_marker(&mut self, _label: &str) {}

    fn push_debug_group(&mut self, _group_label: &str) {}

    fn pop_debug_group(&mut self) {}

    fn write_timestamp(&mut self, _query_set: &dispatch::DispatchQuerySet, _query_index: u32) {
        unsupported(&self.gpu, "timestamps inside passes");
    }

    fn begin_occlusion_query(&mut self, _query_index: u32) {
        unsupported(&self.gpu, "occlusion queries");
    }

    fn end_occlusion_query(&mut self) {}

    fn begin_pipeline_statistics_query(&mut self, _query_set: &dispatch::DispatchQuerySet, _query_index: u32) {
        unsupported(&self.gpu, "pipeline statistics");
    }

    fn end_pipeline_statistics_query(&mut self) {}

    /// A bundle's records, replayed in the pass.
    fn execute_bundles(&mut self, render_bundles: &mut dyn Iterator<Item = &dispatch::DispatchRenderBundle>) {
        let mut commands = self.commands.lock().unwrap();
        for bundle in render_bundles {
            let bundle = bundle.as_custom::<DollyRenderBundle>().unwrap();
            for record in &bundle.records {
                commands.push(Record(record.0.clone()));
            }
            commands.keep.extend(bundle.keep.iter().cloned());
        }
    }
}

#[derive(Debug, Default)]
pub struct DollyRenderBundleEncoder {
    commands: Commands,
}

impl dispatch::RenderBundleEncoderInterface for DollyRenderBundleEncoder {
    fn set_pipeline(&mut self, pipeline: &dispatch::DispatchRenderPipeline) {
        self.commands.set_render_pipeline(pipeline);
    }

    fn set_bind_group(&mut self, index: u32, bind_group: Option<&dispatch::DispatchBindGroup>, offsets: &[crate::DynamicOffset]) {
        self.commands.set_bind_group(index, bind_group, offsets);
    }

    fn set_index_buffer(
        &mut self,
        buffer: &dispatch::DispatchBuffer,
        index_format: crate::IndexFormat,
        offset: crate::BufferAddress,
        size: Option<crate::BufferSize>,
    ) {
        self.commands.set_index_buffer(buffer, index_format, offset, size);
    }

    fn set_vertex_buffer(
        &mut self,
        slot: u32,
        buffer: Option<&dispatch::DispatchBuffer>,
        offset: crate::BufferAddress,
        size: Option<crate::BufferSize>,
    ) {
        self.commands.set_vertex_buffer(slot, buffer, offset, size);
    }

    fn set_immediates(&mut self, _offset: u32, _data: &[u8]) {
        panic!("gpu@0 has no immediates");
    }

    fn draw(&mut self, vertices: Range<u32>, instances: Range<u32>) {
        self.commands.draw(vertices, instances);
    }

    fn draw_indexed(&mut self, indices: Range<u32>, base_vertex: i32, instances: Range<u32>) {
        self.commands.draw_indexed(indices, base_vertex, instances);
    }

    fn draw_indirect(&mut self, indirect_buffer: &dispatch::DispatchBuffer, indirect_offset: crate::BufferAddress) {
        self.commands.indirect(op::DRAW_INDIRECT, indirect_buffer, indirect_offset);
    }

    fn draw_indexed_indirect(&mut self, indirect_buffer: &dispatch::DispatchBuffer, indirect_offset: crate::BufferAddress) {
        self.commands.indirect(op::DRAW_INDEXED_INDIRECT, indirect_buffer, indirect_offset);
    }

    fn finish(self, _desc: &crate::RenderBundleDescriptor<'_>) -> dispatch::DispatchRenderBundle {
        dispatch::DispatchRenderBundle::custom(DollyRenderBundle { records: self.commands.records, keep: self.commands.keep })
    }

    fn finish_boxed(self: alloc::boxed::Box<Self>, desc: &crate::RenderBundleDescriptor<'_>) -> dispatch::DispatchRenderBundle {
        (*self).finish(desc)
    }
}

#[derive(Debug)]
pub struct DollyRenderBundle {
    records: Vec<Record>,
    keep: Vec<Keep>,
}

impl dispatch::RenderBundleInterface for DollyRenderBundle {}
