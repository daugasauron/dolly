// SPIR-V of Vulkan GLSL shaders to WGSL: SPIRV-Tools' standard passes and the ones below, then
// Tint's SPIR-V reader and WGSL writer (spirv_wgsl.h). Each pass of ours rewrites one construct
// that Tint does not read or WGSL cannot express, and leaves everything else to the standard ones.
#include "spirv_wgsl.h"

#include "source/opt/instruction.h"
#include "source/opt/ir_builder.h"
#include "source/opt/ir_context.h"
#include "source/opt/pass.h"
#include "spirv-tools/optimizer.hpp"
#include "src/tint/api/tint.h"
#include "src/tint/lang/core/ir/module.h"
#include "src/tint/lang/spirv/reader/reader.h"
#include "src/tint/lang/wgsl/inspector/inspector.h"
#include "src/tint/lang/wgsl/writer/writer.h"

#include <algorithm>
#include <cstdlib>
#include <cstring>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <vector>

namespace spvtools::opt {
namespace {

using Op = spv::Op;
using Decoration = spv::Decoration;
using StorageClass = spv::StorageClass;

Instruction *pointee(IRContext *context, const Instruction &variable) {
	Instruction *pointer = context->get_def_use_mgr()->GetDef(variable.type_id());
	return context->get_def_use_mgr()->GetDef(pointer->GetSingleWordInOperand(1));
}

Instruction *element_type(IRContext *context, Instruction *type) {
	while (type->opcode() == Op::OpTypeArray || type->opcode() == Op::OpTypeRuntimeArray) {
		type = context->get_def_use_mgr()->GetDef(type->GetSingleWordInOperand(0));
	}
	return type;
}

Instruction *decoration(IRContext *context, uint32_t id, Decoration which) {
	for (Instruction *d : context->get_decoration_mgr()->GetDecorationsFor(id, false)) {
		if (d->opcode() == Op::OpDecorate && Decoration(d->GetSingleWordInOperand(1)) == which) {
			return d;
		}
	}
	return nullptr;
}

// Descriptor set s, binding b becomes bind group s and the binding spirv_wgsl_plan gave the
// uniform; the sampler half of a split combined image sampler follows its images.
class RemapBindings : public Pass {
public:
	RemapBindings(const spirv_wgsl_uniform *u, size_t n, std::string *e) : uniforms(u), count(n), error(e) {}
	const char *name() const override { return "dolly-remap-bindings"; }
	Status Process() override {
		for (Instruction &variable : context()->types_values()) {
			if (variable.opcode() != Op::OpVariable) continue;
			Instruction *set = decoration(context(), variable.result_id(), Decoration::DescriptorSet);
			Instruction *binding = decoration(context(), variable.result_id(), Decoration::Binding);
			if (!set || !binding) continue;
			const uint32_t s = set->GetSingleWordInOperand(2), b = binding->GetSingleWordInOperand(2);
			const spirv_wgsl_uniform *u = std::find_if(uniforms, uniforms + count,
					[&](const spirv_wgsl_uniform &x) { return x.set == s && x.binding == b; });
			if (u == uniforms + count) {
				*error = "set " + std::to_string(s) + " binding " + std::to_string(b) + " is not in the shader's reflection";
				return Status::Failure;
			}
			const bool sampler = element_type(context(), pointee(context(), variable))->opcode() == Op::OpTypeSampler;
			binding->SetInOperand(2, { u->first + (u->combined && sampler ? u->length : 0) });
		}
		return Status::SuccessWithChange;
	}

private:
	const spirv_wgsl_uniform *uniforms;
	size_t count;
	std::string *error;
};

// An array of descriptors accessed in one block and used in another: every step from the access
// to its use (the access, its load, a sampled image, an image) is copied next to each use, so that
// --replace-desc-array-access-using-var-index finds them in one block.
class SinkDescriptorAccess : public Pass {
public:
	const char *name() const override { return "dolly-sink-descriptor-access"; }
	Status Process() override {
		bool changed = false;
		for (bool again = true; again;) {
			again = false;
			std::vector<std::pair<Instruction *, uint32_t>> uses;  // user, operand index
			for (Function &function : *get_module()) {
				for (BasicBlock &block : function) {
					for (Instruction &inst : block) {
						for (uint32_t i = 0; i < inst.NumInOperands(); i++) {
							if (!spvIsIdType(inst.GetInOperand(i).type)) continue;
							Instruction *def = get_def_use_mgr()->GetDef(inst.GetSingleWordInOperand(i));
							if (def && descriptor(def) && context()->get_instr_block(def) != &block && inst.opcode() != Op::OpPhi) {
								uses.push_back({ &inst, i });
							}
						}
					}
				}
			}
			for (auto [user, i] : uses) {
				user->SetInOperand(i, { copy(get_def_use_mgr()->GetDef(user->GetSingleWordInOperand(i)), user) });
				get_def_use_mgr()->AnalyzeInstUse(user);
				again = changed = true;
			}
		}
		// The originals left unused would still be accesses by a variable index.
		for (bool again = changed; again;) {
			again = false;
			std::vector<Instruction *> unused;
			for (Function &function : *get_module()) {
				for (BasicBlock &block : function) {
					for (Instruction &inst : block) {
						if (descriptor(&inst) && get_def_use_mgr()->NumUsers(&inst) == 0) unused.push_back(&inst);
					}
				}
			}
			for (Instruction *inst : unused) context()->KillInst(inst);
			again = !unused.empty();
		}
		return changed ? Status::SuccessWithChange : Status::SuccessWithoutChange;
	}

private:
	bool descriptor(Instruction *inst) {
		auto def = [&](uint32_t operand) { return get_def_use_mgr()->GetDef(inst->GetSingleWordInOperand(operand)); };
		switch (inst->opcode()) {
			case Op::OpAccessChain:
				return def(0)->opcode() == Op::OpVariable && StorageClass(def(0)->GetSingleWordInOperand(0)) == StorageClass::UniformConstant;
			case Op::OpLoad:
			case Op::OpImage:
				return descriptor(def(0));
			case Op::OpSampledImage:
				return descriptor(def(0)) || descriptor(def(1));
			default:
				return false;
		}
	}
	// A copy of descriptor value inst before at, with its descriptor operands copied there too.
	uint32_t copy(Instruction *inst, Instruction *at) {
		Instruction *made = inst->Clone(context());
		made->SetResultId(TakeNextId());
		made->InsertBefore(at);
		context()->set_instr_block(made, context()->get_instr_block(at));
		for (uint32_t i = 0; i < made->NumInOperands(); i++) {
			if (!spvIsIdType(made->GetInOperand(i).type)) continue;
			Instruction *def = get_def_use_mgr()->GetDef(made->GetSingleWordInOperand(i));
			if (def && descriptor(def) && context()->get_instr_block(def) != context()->get_instr_block(at)) {
				made->SetInOperand(i, { copy(def, made) });
			}
		}
		get_def_use_mgr()->AnalyzeInstDefUse(made);
		return made->result_id();
	}
};

// Push constants become a read-only storage buffer at group 0, binding 0.
class PushConstantsToStorage : public Pass {
public:
	const char *name() const override { return "dolly-push-constants"; }
	Status Process() override {
		bool changed = false;
		std::vector<uint32_t> variables;
		for (Instruction &inst : context()->types_values()) {
			const bool pointer = inst.opcode() == Op::OpTypePointer, variable = inst.opcode() == Op::OpVariable;
			if ((pointer || variable) && StorageClass(inst.GetSingleWordInOperand(0)) == StorageClass::PushConstant) {
				inst.SetInOperand(0, { uint32_t(StorageClass::StorageBuffer) });
				if (variable) variables.push_back(inst.result_id());
				changed = true;
			}
		}
		for (uint32_t id : variables) {
			analysis::DecorationManager *decorations = context()->get_decoration_mgr();
			decorations->AddDecorationVal(id, uint32_t(Decoration::DescriptorSet), 0);
			decorations->AddDecorationVal(id, uint32_t(Decoration::Binding), 0);
			decorations->AddDecoration(id, uint32_t(Decoration::NonWritable));
		}
		return changed ? Status::SuccessWithChange : Status::SuccessWithoutChange;
	}
};

// WebGPU draws points one pixel wide and has no point size: stores to it are dropped.
class RemovePointSize : public Pass {
public:
	const char *name() const override { return "dolly-remove-point-size"; }
	Status Process() override {
		std::vector<std::pair<uint32_t, uint32_t>> members;  // struct type, member index
		std::vector<uint32_t> variables;
		for (Instruction &d : get_module()->annotations()) {
			if (d.opcode() == Op::OpMemberDecorate && Decoration(d.GetSingleWordInOperand(2)) == Decoration::BuiltIn &&
					spv::BuiltIn(d.GetSingleWordInOperand(3)) == spv::BuiltIn::PointSize) {
				members.push_back({ d.GetSingleWordInOperand(0), d.GetSingleWordInOperand(1) });
			}
			if (d.opcode() == Op::OpDecorate && Decoration(d.GetSingleWordInOperand(1)) == Decoration::BuiltIn &&
					spv::BuiltIn(d.GetSingleWordInOperand(2)) == spv::BuiltIn::PointSize) {
				variables.push_back(d.GetSingleWordInOperand(0));
			}
		}
		analysis::DefUseManager *uses = context()->get_def_use_mgr();
		auto point_size = [&](Instruction *pointer) {
			if (std::find(variables.begin(), variables.end(), pointer->result_id()) != variables.end()) return true;
			if (pointer->opcode() != Op::OpAccessChain || pointer->NumInOperands() < 2) return false;
			Instruction *base = uses->GetDef(pointer->GetSingleWordInOperand(0));
			if (base->opcode() != Op::OpVariable) return false;
			const uint32_t type = pointee(context(), *base)->result_id();
			const analysis::Constant *index = context()->get_constant_mgr()->FindDeclaredConstant(pointer->GetSingleWordInOperand(1));
			return index && std::find(members.begin(), members.end(), std::make_pair(type, uint32_t(index->GetZeroExtendedValue()))) != members.end();
		};
		std::vector<Instruction *> stores;
		for (Function &function : *get_module()) {
			for (BasicBlock &block : function) {
				for (Instruction &inst : block) {
					if (inst.opcode() == Op::OpStore && point_size(uses->GetDef(inst.GetSingleWordInOperand(0)))) stores.push_back(&inst);
				}
			}
		}
		for (Instruction *store : stores) context()->KillInst(store);
		return stores.empty() ? Status::SuccessWithoutChange : Status::SuccessWithChange;
	}
};

// glslang writes memoryBarrierShared(); barrier(); as a memory barrier then a control barrier;
// WGSL has only the latter, which takes the former's memory semantics. glslang's memoryBarrier()
// also names atomic counter memory, which Vulkan does not have.
class MergeMemoryBarriers : public Pass {
public:
	const char *name() const override { return "dolly-merge-memory-barriers"; }
	Status Process() override {
		bool changed = false;
		std::vector<Instruction *> merged;
		analysis::ConstantManager *constants = context()->get_constant_mgr();
		auto semantics = [&](uint32_t id) {
			const analysis::Constant *c = constants->FindDeclaredConstant(id);
			return c ? c->GetU32() & ~uint32_t(spv::MemorySemanticsMask::AtomicCounterMemory) : ~0u;
		};
		for (Function &function : *get_module()) {
			for (BasicBlock &block : function) {
				for (auto inst = block.begin(); inst != block.end(); ++inst) {
					if (inst->opcode() == Op::OpControlBarrier && semantics(inst->GetSingleWordInOperand(2)) != ~0u) {
						inst->SetInOperand(2, { constants->GetUIntConstId(semantics(inst->GetSingleWordInOperand(2))) });
						changed = true;
					}
					auto next = inst;
					++next;
					if (inst->opcode() != Op::OpMemoryBarrier || next == block.end() || next->opcode() != Op::OpControlBarrier) continue;
					const uint32_t a = semantics(inst->GetSingleWordInOperand(1)), b = semantics(next->GetSingleWordInOperand(2));
					if (a == ~0u || b == ~0u) continue;
					next->SetInOperand(2, { constants->GetUIntConstId(a | b) });
					merged.push_back(&*inst);
				}
			}
		}
		for (Instruction *barrier : merged) context()->KillInst(barrier);
		return changed || !merged.empty() ? Status::SuccessWithChange : Status::SuccessWithoutChange;
	}
};

// WGSL storage buffers are read-only or read-write: a write-only one becomes read-write.
class WriteOnlyStorage : public Pass {
public:
	const char *name() const override { return "dolly-write-only-storage"; }
	Status Process() override {
		std::vector<Instruction *> writes;
		for (Instruction &d : get_module()->annotations()) {
			const bool member = d.opcode() == Op::OpMemberDecorate;
			if ((member || d.opcode() == Op::OpDecorate) && Decoration(d.GetSingleWordInOperand(member ? 2 : 1)) == Decoration::NonReadable) {
				const Instruction *target = get_def_use_mgr()->GetDef(d.GetSingleWordInOperand(0));
				const bool image = target->opcode() == Op::OpVariable && element_type(context(), pointee(context(), *target))->opcode() == Op::OpTypeImage;
				if (!image) writes.push_back(&d);
			}
		}
		for (Instruction *d : writes) context()->KillInst(d);
		return writes.empty() ? Status::SuccessWithoutChange : Status::SuccessWithChange;
	}
};

// Vulkan's clip space points y down, WebGPU's up: a vertex shader's position has its y negated,
// as Godot's Direct3D 12 and Metal containers do. Godot's front faces are then WebGPU's.
class FlipVertexY : public Pass {
public:
	const char *name() const override { return "dolly-flip-vertex-y"; }
	std::string *error;
	explicit FlipVertexY(std::string *e) : error(e) {}
	Status Process() override {
		std::vector<std::pair<uint32_t, uint32_t>> members;
		std::vector<uint32_t> variables;
		for (Instruction &d : get_module()->annotations()) {
			if (d.opcode() == Op::OpMemberDecorate && Decoration(d.GetSingleWordInOperand(2)) == Decoration::BuiltIn &&
					spv::BuiltIn(d.GetSingleWordInOperand(3)) == spv::BuiltIn::Position) {
				members.push_back({ d.GetSingleWordInOperand(0), d.GetSingleWordInOperand(1) });
			}
			if (d.opcode() == Op::OpDecorate && Decoration(d.GetSingleWordInOperand(1)) == Decoration::BuiltIn &&
					spv::BuiltIn(d.GetSingleWordInOperand(2)) == spv::BuiltIn::Position) {
				variables.push_back(d.GetSingleWordInOperand(0));
			}
		}
		analysis::DefUseManager *uses = context()->get_def_use_mgr();
		analysis::ConstantManager *constants = context()->get_constant_mgr();
		std::vector<std::pair<Instruction *, int>> stores;  // store, component it writes (-1: the whole position)
		for (Function &function : *get_module()) {
			for (BasicBlock &block : function) {
				for (Instruction &inst : block) {
					if (inst.opcode() != Op::OpStore) continue;
					Instruction *pointer = uses->GetDef(inst.GetSingleWordInOperand(0));
					uint32_t index = 0;  // in-operand where the indices into the position start
					if (pointer->opcode() == Op::OpVariable) {
						if (std::find(variables.begin(), variables.end(), pointer->result_id()) == variables.end()) continue;
						index = 1;
					} else if (pointer->opcode() == Op::OpAccessChain) {
						Instruction *base = uses->GetDef(pointer->GetSingleWordInOperand(0));
						if (base->opcode() != Op::OpVariable) continue;
						if (std::find(variables.begin(), variables.end(), base->result_id()) != variables.end()) {
							index = 1;
						} else {
							const analysis::Constant *member = constants->FindDeclaredConstant(pointer->GetSingleWordInOperand(1));
							const uint32_t type = pointee(context(), *base)->result_id();
							if (!member || std::find(members.begin(), members.end(), std::make_pair(type, uint32_t(member->GetZeroExtendedValue()))) == members.end()) continue;
							index = 2;
						}
					} else {
						continue;
					}
					if (pointer->opcode() == Op::OpVariable || pointer->NumInOperands() == index) {
						stores.push_back({ &inst, -1 });
					} else {
						const analysis::Constant *component = constants->FindDeclaredConstant(pointer->GetSingleWordInOperand(index));
						if (!component) {
							*error = "a vertex position component is written by a variable index";
							return Status::Failure;
						}
						stores.push_back({ &inst, int(component->GetZeroExtendedValue()) });
					}
				}
			}
		}
		for (auto [store, component] : stores) {
			if (component != -1 && component != 1) continue;
			InstructionBuilder builder(context(), store, IRContext::kAnalysisDefUse | IRContext::kAnalysisInstrToBlockMapping);
			const uint32_t value = store->GetSingleWordInOperand(1);
			const uint32_t type = uses->GetDef(value)->type_id();
			if (component == 1) {
				store->SetInOperand(1, { builder.AddUnaryOp(type, Op::OpFNegate, value)->result_id() });
			} else {
				const uint32_t scalar = uses->GetDef(type)->GetSingleWordInOperand(0);
				Instruction *y = builder.AddCompositeExtract(scalar, value, { 1 });
				Instruction *negated = builder.AddUnaryOp(scalar, Op::OpFNegate, y->result_id());
				Instruction *flipped = builder.AddInstruction(std::make_unique<Instruction>(context(), Op::OpCompositeInsert, type, TakeNextId(),
						std::initializer_list<Operand>{ { SPV_OPERAND_TYPE_ID, { negated->result_id() } }, { SPV_OPERAND_TYPE_ID, { value } },
								{ SPV_OPERAND_TYPE_LITERAL_INTEGER, { 1 } } }));
				store->SetInOperand(1, { flipped->result_id() });
			}
			uses->AnalyzeInstUse(store);
		}
		return stores.empty() ? Status::SuccessWithoutChange : Status::SuccessWithChange;
	}
};

// WebGPU has no subpasses: an input attachment, which Godot's driver binds as the texture the
// previous pass drew, is read with a fetch at the fragment's position.
class InputAttachmentsToTextures : public Pass {
public:
	const char *name() const override { return "dolly-input-attachments"; }
	Status Process() override {
		std::vector<Instruction *> types;
		for (Instruction &inst : context()->types_values()) {
			if (inst.opcode() == Op::OpTypeImage && spv::Dim(inst.GetSingleWordInOperand(1)) == spv::Dim::SubpassData) types.push_back(&inst);
		}
		if (types.empty()) return Status::SuccessWithoutChange;
		for (Instruction *type : types) {
			type->SetInOperand(1, { uint32_t(spv::Dim::Dim2D) });
			type->SetInOperand(5, { 1 });  // sampled
		}
		std::vector<Instruction *> dead;
		for (Instruction &d : get_module()->annotations()) {
			if (d.opcode() == Op::OpDecorate && Decoration(d.GetSingleWordInOperand(1)) == Decoration::InputAttachmentIndex) dead.push_back(&d);
		}
		for (Instruction &c : get_module()->capabilities()) {
			if (spv::Capability(c.GetSingleWordInOperand(0)) == spv::Capability::InputAttachment) dead.push_back(&c);
		}
		for (Instruction *inst : dead) context()->KillInst(inst);
		context()->InvalidateAnalyses(IRContext::kAnalysisTypes | IRContext::kAnalysisDecorations);
		const uint32_t position = frag_coord();
		analysis::DefUseManager *uses = context()->get_def_use_mgr();
		analysis::TypeManager *t = context()->get_type_mgr();
		std::vector<Instruction *> reads;
		for (Function &function : *get_module()) {
			for (BasicBlock &block : function) {
				for (Instruction &inst : block) {
					if (inst.opcode() != Op::OpImageRead) continue;
					const Instruction *image_type = uses->GetDef(uses->GetDef(inst.GetSingleWordInOperand(0))->type_id());
					if (std::find(types.begin(), types.end(), image_type) != types.end()) reads.push_back(&inst);
				}
			}
		}
		const uint32_t f32 = t->GetFloatTypeId(), i32 = t->GetSIntTypeId();
		analysis::Vector vec4(t->GetType(f32), 4), vec2(t->GetType(f32), 2), ivec2(t->GetType(i32), 2);
		const uint32_t v4 = t->GetTypeInstruction(&vec4), v2 = t->GetTypeInstruction(&vec2), iv2 = t->GetTypeInstruction(&ivec2);
		for (Instruction *read : reads) {
			InstructionBuilder builder(context(), read, IRContext::kAnalysisDefUse | IRContext::kAnalysisInstrToBlockMapping);
			Instruction *coord = builder.AddLoad(v4, position);
			Instruction *xy = builder.AddVectorShuffle(v2, coord->result_id(), coord->result_id(), { 0, 1 });
			Instruction *texel = builder.AddUnaryOp(iv2, Op::OpConvertFToS, xy->result_id());
			Instruction *at = builder.AddBinaryOp(iv2, Op::OpIAdd, texel->result_id(), read->GetSingleWordInOperand(1));
			read->SetOpcode(Op::OpImageFetch);
			read->SetInOperand(1, { at->result_id() });
			const bool sample = read->NumInOperands() > 2;  // a multisampled input: Sample already follows
			if (!sample) {
				read->AddOperand({ SPV_OPERAND_TYPE_IMAGE, { uint32_t(spv::ImageOperandsMask::Lod) } });
				read->AddOperand({ SPV_OPERAND_TYPE_ID, { context()->get_constant_mgr()->GetSIntConstId(0) } });
			}
			uses->AnalyzeInstUse(read);
		}
		return Status::SuccessWithChange;
	}

private:
	// The fragment shader's FragCoord input, declared here if the shader has none.
	uint32_t frag_coord() {
		for (Instruction &d : get_module()->annotations()) {
			if (d.opcode() == Op::OpDecorate && Decoration(d.GetSingleWordInOperand(1)) == Decoration::BuiltIn &&
					spv::BuiltIn(d.GetSingleWordInOperand(2)) == spv::BuiltIn::FragCoord) {
				return d.GetSingleWordInOperand(0);
			}
		}
		analysis::TypeManager *t = context()->get_type_mgr();
		analysis::Vector vec4(t->GetType(t->GetFloatTypeId()), 4);
		const uint32_t pointer = t->FindPointerToType(t->GetTypeInstruction(&vec4), StorageClass::Input);
		const uint32_t id = TakeNextId();
		auto variable = std::make_unique<Instruction>(context(), Op::OpVariable, pointer, id,
				std::initializer_list<Operand>{ { SPV_OPERAND_TYPE_STORAGE_CLASS, { uint32_t(StorageClass::Input) } } });
		get_def_use_mgr()->AnalyzeInstDefUse(variable.get());
		get_module()->AddGlobalValue(std::move(variable));
		context()->get_decoration_mgr()->AddDecorationVal(id, uint32_t(Decoration::BuiltIn), uint32_t(spv::BuiltIn::FragCoord));
		for (Instruction &entry : get_module()->entry_points()) {
			entry.AddOperand({ SPV_OPERAND_TYPE_ID, { id } });
		}
		return id;
	}
};

uint32_t vector_size(IRContext *context, uint32_t type) {
	const Instruction *t = context->get_def_use_mgr()->GetDef(type);
	return t->opcode() == Op::OpTypeVector ? t->GetSingleWordInOperand(1) : 1;
}

uint32_t uint_type(IRContext *context, uint32_t size) {
	analysis::TypeManager *types = context->get_type_mgr();
	const uint32_t scalar = types->GetUIntTypeId();
	if (size == 1) return scalar;
	analysis::Vector vector(types->GetType(scalar), size);
	return types->GetTypeInstruction(&vector);
}

uint32_t uint_splat(IRContext *context, uint32_t size, uint32_t value) {
	analysis::ConstantManager *constants = context->get_constant_mgr();
	const uint32_t scalar = constants->GetUIntConstId(value);
	if (size == 1) return scalar;
	const analysis::Type *type = context->get_type_mgr()->GetType(uint_type(context, size));
	std::vector<uint32_t> ids(size, scalar);
	return constants->GetDefiningInstruction(constants->GetConstant(type, ids))->result_id();
}

// WGSL has no isnan or isinf: each becomes a test of the 32-bit float's bits.
class NanInfTests : public Pass {
public:
	const char *name() const override { return "dolly-nan-inf-tests"; }
	Status Process() override {
		std::vector<Instruction *> tests;
		for (Function &function : *get_module()) {
			for (BasicBlock &block : function) {
				for (Instruction &inst : block) {
					if (inst.opcode() == Op::OpIsNan || inst.opcode() == Op::OpIsInf) tests.push_back(&inst);
				}
			}
		}
		for (Instruction *test : tests) {
			const uint32_t value = test->GetSingleWordInOperand(0);
			const uint32_t size = vector_size(context(), context()->get_def_use_mgr()->GetDef(value)->type_id());
			InstructionBuilder builder(context(), test, IRContext::kAnalysisDefUse | IRContext::kAnalysisInstrToBlockMapping);
			const uint32_t uints = uint_type(context(), size);
			Instruction *bits = builder.AddUnaryOp(uints, Op::OpBitcast, value);
			Instruction *magnitude = builder.AddBinaryOp(uints, Op::OpBitwiseAnd, bits->result_id(), uint_splat(context(), size, 0x7fffffff));
			Instruction *result = builder.AddBinaryOp(test->type_id(), test->opcode() == Op::OpIsNan ? Op::OpUGreaterThan : Op::OpIEqual,
					magnitude->result_id(), uint_splat(context(), size, 0x7f800000));
			context()->ReplaceAllUsesWith(test->result_id(), result->result_id());
			context()->KillInst(test);
		}
		return tests.empty() ? Status::SuccessWithoutChange : Status::SuccessWithChange;
	}
};

// WGSL constants cannot be infinite or NaN: each such float, and every constant composite made of
// one, is made at the start of the functions that use it from the bits in a private variable.
class RuntimeNonFinite : public Pass {
public:
	explicit RuntimeNonFinite(std::string *e) : error(e) {}
	const char *name() const override { return "dolly-runtime-non-finite"; }
	Status Process() override {
		analysis::DefUseManager *uses = context()->get_def_use_mgr();
		std::vector<Instruction *> order;  // the non-finite constants, then composites after their parts
		auto listed = [&](uint32_t id) { return std::any_of(order.begin(), order.end(), [&](Instruction *i) { return i->result_id() == id; }); };
		for (Instruction &inst : context()->types_values()) {
			if (inst.opcode() == Op::OpConstant) {
				const Instruction *type = uses->GetDef(inst.type_id());
				if (type->opcode() == Op::OpTypeFloat && type->GetSingleWordInOperand(0) == 32 &&
						(inst.GetSingleWordInOperand(0) & 0x7f800000) == 0x7f800000) {
					order.push_back(&inst);
				}
			} else if (inst.opcode() == Op::OpConstantComposite) {
				for (uint32_t i = 0; i < inst.NumInOperands(); i++) {
					if (listed(inst.GetSingleWordInOperand(i))) {
						order.push_back(&inst);
						break;
					}
				}
			}
		}
		if (order.empty()) return Status::SuccessWithoutChange;
		for (Instruction *constant : order) {
			bool global = false;
			uses->ForEachUser(constant, [&](Instruction *user) {
				global |= !context()->get_instr_block(user) && !listed(user->result_id()) && user->opcode() != Op::OpName;
			});
			if (global) {
				*error = "a non-finite constant is used outside a function";
				return Status::Failure;
			}
		}
		std::map<uint32_t, uint32_t> variables;  // bits, private variable
		for (Function &function : *get_module()) {
			std::map<uint32_t, uint32_t> runtime;  // constant, its value made here
			std::vector<Instruction *> users;
			for (BasicBlock &block : function) {
				for (Instruction &inst : block) {
					inst.ForEachInId([&](const uint32_t *id) {
						if (listed(*id) && std::find(users.begin(), users.end(), &inst) == users.end()) users.push_back(&inst);
					});
				}
			}
			if (users.empty()) continue;
			auto at = function.begin()->begin();
			while (at->opcode() == Op::OpVariable) ++at;
			InstructionBuilder builder(context(), &*at, IRContext::kAnalysisDefUse | IRContext::kAnalysisInstrToBlockMapping);
			for (Instruction *constant : order) {
				if (constant->opcode() == Op::OpConstant) {
					const uint32_t bits = constant->GetSingleWordInOperand(0);
					if (!variables.count(bits)) variables[bits] = private_bits(bits);
					Instruction *load = builder.AddLoad(context()->get_type_mgr()->GetUIntTypeId(), variables[bits]);
					runtime[constant->result_id()] = builder.AddUnaryOp(constant->type_id(), Op::OpBitcast, load->result_id())->result_id();
				} else {
					std::vector<uint32_t> parts;
					for (uint32_t i = 0; i < constant->NumInOperands(); i++) {
						const uint32_t part = constant->GetSingleWordInOperand(i);
						parts.push_back(runtime.count(part) ? runtime[part] : part);
					}
					runtime[constant->result_id()] = builder.AddCompositeConstruct(constant->type_id(), parts)->result_id();
				}
			}
			for (Instruction *user : users) {
				user->ForEachInId([&](uint32_t *id) {
					if (runtime.count(*id)) *id = runtime[*id];
				});
				uses->AnalyzeInstUse(user);
			}
		}
		return Status::SuccessWithChange;
	}

private:
	std::string *error;
	uint32_t private_bits(uint32_t bits) {
		analysis::TypeManager *types = context()->get_type_mgr();
		const uint32_t pointer = types->FindPointerToType(types->GetUIntTypeId(), StorageClass::Private);
		const uint32_t id = TakeNextId();
		auto variable = std::make_unique<Instruction>(context(), Op::OpVariable, pointer, id,
				std::initializer_list<Operand>{ { SPV_OPERAND_TYPE_STORAGE_CLASS, { uint32_t(StorageClass::Private) } },
						{ SPV_OPERAND_TYPE_ID, { context()->get_constant_mgr()->GetUIntConstId(bits) } } });
		context()->get_def_use_mgr()->AnalyzeInstDefUse(variable.get());
		get_module()->AddGlobalValue(std::move(variable));
		return id;
	}
};

// A fetch from a multisampled texture that glslang made through a sampler fetches from the image.
class MultisampleFetch : public Pass {
public:
	const char *name() const override { return "dolly-multisample-fetch"; }
	Status Process() override {
		analysis::DefUseManager *uses = context()->get_def_use_mgr();
		std::vector<Instruction *> images;
		for (Function &function : *get_module()) {
			for (BasicBlock &block : function) {
				for (Instruction &inst : block) {
					if (inst.opcode() != Op::OpImage) continue;
					Instruction *sampled = uses->GetDef(inst.GetSingleWordInOperand(0));
					if (sampled->opcode() == Op::OpSampledImage && uses->GetDef(inst.type_id())->GetSingleWordInOperand(4) == 1) {
						images.push_back(&inst);
					}
				}
			}
		}
		for (Instruction *image : images) {
			Instruction *sampled = uses->GetDef(image->GetSingleWordInOperand(0));
			context()->ReplaceAllUsesWith(image->result_id(), sampled->GetSingleWordInOperand(0));
			context()->KillInst(image);
			if (uses->NumUsers(sampled) == 0) context()->KillInst(sampled);
		}
		std::vector<Instruction *> types;
		for (Instruction &inst : context()->types_values()) {
			if (inst.opcode() == Op::OpTypeSampledImage && uses->GetDef(inst.GetSingleWordInOperand(0))->GetSingleWordInOperand(4) == 1 &&
					uses->NumUsers(&inst) == 0) {
				types.push_back(&inst);
			}
		}
		for (Instruction *type : types) context()->KillInst(type);
		return images.empty() && types.empty() ? Status::SuccessWithoutChange : Status::SuccessWithChange;
	}
};

// A vertex shader's storage buffers must be read-only in WebGPU: one it never writes is marked so.
class VertexReadOnlyStorage : public Pass {
public:
	const char *name() const override { return "dolly-vertex-read-only-storage"; }
	Status Process() override {
		bool vertex = false;
		for (Instruction &entry : get_module()->entry_points()) {
			vertex |= spv::ExecutionModel(entry.GetSingleWordInOperand(0)) == spv::ExecutionModel::Vertex;
		}
		if (!vertex) return Status::SuccessWithoutChange;
		analysis::DefUseManager *uses = context()->get_def_use_mgr();
		bool changed = false;
		for (Instruction &variable : context()->types_values()) {
			if (variable.opcode() != Op::OpVariable || StorageClass(variable.GetSingleWordInOperand(0)) != StorageClass::StorageBuffer ||
					decoration(context(), variable.result_id(), Decoration::NonWritable)) {
				continue;
			}
			bool written = false;
			std::vector<Instruction *> pointers = { &variable };
			while (!pointers.empty() && !written) {
				Instruction *pointer = pointers.back();
				pointers.pop_back();
				uses->ForEachUser(pointer, [&](Instruction *user) {
					if (user->opcode() == Op::OpAccessChain || user->opcode() == Op::OpInBoundsAccessChain) pointers.push_back(user);
					else if (user->opcode() != Op::OpLoad && user->opcode() != Op::OpArrayLength && user->opcode() != Op::OpName &&
							user->opcode() != Op::OpDecorate && user->opcode() != Op::OpEntryPoint) {
						written = true;
					}
				});
			}
			if (written) continue;
			context()->get_decoration_mgr()->AddDecoration(variable.result_id(), uint32_t(Decoration::NonWritable));
			changed = true;
		}
		return changed ? Status::SuccessWithChange : Status::SuccessWithoutChange;
	}
};

// WGSL cannot ask whether an invocation is a helper. Helper invocations write nothing in Vulkan
// and in WebGPU alike, so the answer is false.
class HelperInvocationFalse : public Pass {
public:
	const char *name() const override { return "dolly-helper-invocation"; }
	Status Process() override {
		uint32_t helper = 0;
		for (Instruction &d : get_module()->annotations()) {
			if (d.opcode() == Op::OpDecorate && Decoration(d.GetSingleWordInOperand(1)) == Decoration::BuiltIn &&
					spv::BuiltIn(d.GetSingleWordInOperand(2)) == spv::BuiltIn::HelperInvocation) {
				helper = d.GetSingleWordInOperand(0);
			}
		}
		if (!helper) return Status::SuccessWithoutChange;
		analysis::DefUseManager *uses = context()->get_def_use_mgr();
		std::vector<Instruction *> loads;
		uses->ForEachUser(helper, [&](Instruction *user) {
			if (user->opcode() == Op::OpLoad) loads.push_back(user);
		});
		const uint32_t no = context()->get_constant_mgr()->GetDefiningInstruction(
				context()->get_constant_mgr()->GetConstant(context()->get_type_mgr()->GetBoolType(), { 0 }))->result_id();
		for (Instruction *load : loads) {
			context()->ReplaceAllUsesWith(load->result_id(), no);
			context()->KillInst(load);
		}
		for (Instruction &entry : get_module()->entry_points()) {
			Instruction::OperandList operands;
			for (uint32_t i = 0; i < entry.NumOperands(); i++) {
				if (i < 3 || entry.GetSingleWordOperand(i) != helper) operands.push_back(entry.GetOperand(i));
			}
			entry.ReplaceOperands(operands);
		}
		context()->KillInst(uses->GetDef(helper));
		return Status::SuccessWithChange;
	}
};

} // namespace
} // namespace spvtools::opt

namespace {

using spvtools::opt::Pass;
using spvtools::Optimizer;

template <typename T, typename... A>
Optimizer::PassToken pass(A &&...arguments) {
	return Optimizer::PassToken(std::make_unique<T>(std::forward<A>(arguments)...));
}

uint32_t gpu_format(tint::inspector::ResourceBinding::TexelFormat format) {
	using F = tint::inspector::ResourceBinding::TexelFormat;
	switch (format) {
		case F::kRgba8Unorm: return 1;
		case F::kR8Unorm: return 3;
		case F::kRg8Unorm: return 4;
		case F::kR8Snorm: return 10;
		case F::kR8Uint: return 11;
		case F::kR8Sint: return 12;
		case F::kR16Uint: return 13;
		case F::kR16Sint: return 14;
		case F::kR16Float: return 15;
		case F::kRg8Snorm: return 16;
		case F::kRg8Uint: return 17;
		case F::kRg8Sint: return 18;
		case F::kR32Uint: return 19;
		case F::kR32Sint: return 20;
		case F::kR32Float: return 21;
		case F::kRg16Uint: return 22;
		case F::kRg16Sint: return 23;
		case F::kRg16Float: return 24;
		case F::kRgba8Snorm: return 25;
		case F::kRgba8Uint: return 26;
		case F::kRgba8Sint: return 27;
		case F::kBgra8Unorm: return 28;
		case F::kRgb10A2Uint: return 31;
		case F::kRgb10A2Unorm: return 32;
		case F::kRg11B10Ufloat: return 33;
		case F::kRg32Uint: return 34;
		case F::kRg32Sint: return 35;
		case F::kRg32Float: return 36;
		case F::kRgba16Uint: return 37;
		case F::kRgba16Sint: return 38;
		case F::kRgba16Float: return 39;
		case F::kRgba32Uint: return 40;
		case F::kRgba32Sint: return 41;
		case F::kRgba32Float: return 42;
		case F::kR16Unorm: return 57;
		case F::kR16Snorm: return 58;
		case F::kRg16Unorm: return 59;
		case F::kRg16Snorm: return 60;
		case F::kRgba16Unorm: return 61;
		case F::kRgba16Snorm: return 62;
		default: return 0;
	}
}

uint32_t view_dimension(tint::inspector::ResourceBinding::TextureDimension dimension) {
	using D = tint::inspector::ResourceBinding::TextureDimension;
	switch (dimension) {
		case D::k1d: return 1;
		case D::k2d: return 2;
		case D::k2dArray: return 3;
		case D::kCube: return 4;
		case D::kCubeArray: return 5;
		case D::k3d: return 6;
		default: return 0;
	}
}

// One gpu@0 layout entry for a binding Tint reports; type 0 for one gpu@0 cannot bind.
spirv_wgsl_binding layout_entry(const tint::inspector::ResourceBinding &r) {
	using R = tint::inspector::ResourceBinding::ResourceType;
	using K = tint::inspector::ResourceBinding::SampledKind;
	spirv_wgsl_binding entry = { r.bind_group, r.binding, 0, 0, 0, 0 };
	const uint32_t sample = r.sampled_kind == K::kUInt ? 5 : r.sampled_kind == K::kSInt ? 4 : r.sampled_kind == K::kUnfilterable ? 2 : 1;
	switch (r.resource_type) {
		case R::kUniformBuffer: entry.type = 1; break;
		case R::kStorageBuffer: entry.type = 2; break;
		case R::kReadOnlyStorageBuffer: entry.type = 3; break;
		case R::kSampler: entry.type = r.sampler_type == tint::inspector::ResourceBinding::SamplerType::kComparison ? 6 : 4; break;
		case R::kSampledTexture: entry = { r.bind_group, r.binding, 7, sample, view_dimension(r.dim), 0 }; break;
		case R::kMultisampledTexture: entry = { r.bind_group, r.binding, 7, sample == 1 ? 2 : sample, view_dimension(r.dim), 1 }; break;
		case R::kDepthTexture: entry = { r.bind_group, r.binding, 7, 3, view_dimension(r.dim), 0 }; break;
		case R::kDepthMultisampledTexture: entry = { r.bind_group, r.binding, 7, 3, view_dimension(r.dim), 1 }; break;
		case R::kWriteOnlyStorageTexture: entry = { r.bind_group, r.binding, 8, 1, view_dimension(r.dim), gpu_format(r.image_format) }; break;
		case R::kReadOnlyStorageTexture: entry = { r.bind_group, r.binding, 8, 2, view_dimension(r.dim), gpu_format(r.image_format) }; break;
		case R::kReadWriteStorageTexture: entry = { r.bind_group, r.binding, 8, 3, view_dimension(r.dim), gpu_format(r.image_format) }; break;
		default: break;
	}
	if (entry.type == 8 && !entry.c) entry.type = 0;
	return entry;
}

char *copy(const std::string &text) {
	char *out = static_cast<char *>(std::malloc(text.size() + 1));
	std::memcpy(out, text.c_str(), text.size() + 1);
	return out;
}

} // namespace

extern "C" void spirv_wgsl_plan(spirv_wgsl_uniform *uniforms, size_t count) {
	std::vector<spirv_wgsl_uniform *> order;
	for (size_t i = 0; i < count; i++) order.push_back(&uniforms[i]);
	std::sort(order.begin(), order.end(), [](const spirv_wgsl_uniform *a, const spirv_wgsl_uniform *b) {
		return a->set != b->set ? a->set < b->set : a->binding < b->binding;
	});
	uint32_t set = ~0u, next = 0;
	for (spirv_wgsl_uniform *u : order) {
		if (u->set != set) {
			set = u->set;
			next = set == 0 ? 1 : 0;
		}
		u->first = next;
		next += std::max(1u, u->length) * (u->combined ? 2 : 1);
	}
}

extern "C" void spirv_wgsl_translate(const uint32_t *words, size_t word_count, const spirv_wgsl_uniform *uniforms,
		size_t uniform_count, spirv_wgsl_result *result) {
	*result = {};
	static std::once_flag initialized;
	std::call_once(initialized, [] { tint::Initialize(); });
	std::string messages;
	Optimizer optimizer(SPV_ENV_VULKAN_1_1);
	optimizer.SetMessageConsumer([&](spv_message_level_t level, const char *, const spv_position_t &, const char *message) {
		if (level <= SPV_MSG_ERROR) messages += std::string(message) + "\n";
	});
	namespace o = spvtools::opt;
	std::string ours;  // what a pass of ours failed on
	optimizer.RegisterPass(spvtools::CreateSplitCombinedImageSamplerPass())
			.RegisterPass(pass<o::RemapBindings>(uniforms, uniform_count, &ours))
			.RegisterPass(spvtools::CreateMergeReturnPass())
			.RegisterPass(spvtools::CreateInlineExhaustivePass())
			.RegisterPass(spvtools::CreateEliminateDeadFunctionsPass())
			.RegisterPass(pass<o::SinkDescriptorAccess>())
			.RegisterPass(spvtools::CreateReplaceDescArrayAccessUsingVarIndexPass())
			// The replacement leaves each original access, dead, which the next pass refuses.
			.RegisterPass(spvtools::CreateAggressiveDCEPass())
			.RegisterPass(spvtools::CreateDescriptorScalarReplacementPass())
			.RegisterPass(pass<o::PushConstantsToStorage>())
			.RegisterPass(pass<o::RemovePointSize>())
			.RegisterPass(pass<o::MergeMemoryBarriers>())
			.RegisterPass(pass<o::WriteOnlyStorage>())
			.RegisterPass(pass<o::FlipVertexY>(&ours))
			.RegisterPass(pass<o::InputAttachmentsToTextures>())
			.RegisterPass(pass<o::NanInfTests>())
			.RegisterPass(pass<o::RuntimeNonFinite>(&ours))
			.RegisterPass(pass<o::MultisampleFetch>())
			.RegisterPass(pass<o::VertexReadOnlyStorage>())
			.RegisterPass(pass<o::HelperInvocationFalse>())
			.RegisterPass(spvtools::CreateAggressiveDCEPass())
			.RegisterPass(spvtools::CreateDeadVariableEliminationPass())
			.RegisterPass(spvtools::CreateEliminateDeadConstantPass());
	std::vector<uint32_t> spirv;
	if (!optimizer.Run(words, word_count, &spirv)) {
		result->error = copy("SPIR-V passes failed: " + (ours.empty() ? messages : ours));
		return;
	}
	auto ir = tint::spirv::reader::ReadIR(spirv);
	if (ir != tint::Success) {
		result->error = copy("Tint read: " + ir.Failure().reason);
		return;
	}
	tint::wgsl::writer::Options options;
	options.allow_non_uniform_derivatives = true;
	auto program = tint::wgsl::writer::ProgramFromIR(ir.Get(), options);
	if (program != tint::Success) {
		result->error = copy("Tint IR to WGSL: " + program.Failure().reason);
		return;
	}
	auto wgsl = tint::wgsl::writer::Generate(program.Get(), options);
	if (wgsl != tint::Success) {
		result->error = copy("Tint WGSL: " + wgsl.Failure().reason);
		return;
	}
	tint::inspector::Inspector inspector(program.Get());
	// A float texture no sampler reads (loads and queries alone) binds as unfilterable-float,
	// where any float texture binds, and a depth texture too.
	std::set<std::pair<uint32_t, uint32_t>> sampled;
	for (const auto &pair : inspector.GetSamplerTextureUses("main")) {
		sampled.insert({ pair.texture_binding_point.group, pair.texture_binding_point.binding });
	}
	std::vector<spirv_wgsl_binding> bindings;
	for (const auto &binding : inspector.GetResourceBindings("main")) {
		spirv_wgsl_binding entry = layout_entry(binding);
		if (binding.resource_type == tint::inspector::ResourceBinding::ResourceType::kSampledTexture && entry.a == 1 &&
				!sampled.count({ binding.bind_group, binding.binding })) {
			entry.a = 2;
		}
		if (!entry.type) {
			result->error = copy("binding " + std::to_string(binding.binding) + " of group " + std::to_string(binding.bind_group) +
					" has no gpu@0 layout entry");
			return;
		}
		bindings.push_back(entry);
	}
	std::vector<uint32_t> overrides;
	for (const auto &o : inspector.GetEntryPoint("main").overrides) overrides.push_back(o.id.value);
	result->wgsl = copy(wgsl->wgsl);
	result->binding_count = bindings.size();
	result->bindings = static_cast<spirv_wgsl_binding *>(std::malloc(sizeof(spirv_wgsl_binding) * std::max<size_t>(1, bindings.size())));
	std::copy(bindings.begin(), bindings.end(), result->bindings);
	result->override_count = overrides.size();
	result->overrides = static_cast<uint32_t *>(std::malloc(sizeof(uint32_t) * std::max<size_t>(1, overrides.size())));
	std::copy(overrides.begin(), overrides.end(), result->overrides);
}

extern "C" void spirv_wgsl_free(spirv_wgsl_result *result) {
	std::free(result->wgsl);
	std::free(result->bindings);
	std::free(result->overrides);
	std::free(result->error);
	*result = {};
}
